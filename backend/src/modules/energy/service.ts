import { z } from 'zod';
import type { Database } from '../../shared/database/client.js';
import type { Prisma,TelemetrySample } from '../../generated/prisma/client.js';
import type { Telemetry } from '../iot/protocol.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { writeAudit,type AuditContext } from '../audit/service.js';
const policySchema=z.object({capacityKwh:z.number().positive().max(10000),minSocPct:z.number().min(0).max(100),maxSocPct:z.number().min(0).max(100),maxChargeKw:z.number().min(0).max(1000),maxDischargeKw:z.number().min(0).max(1000),auxiliaryKw:z.number().min(0).max(100),importTariffMinor:z.number().int().min(0).max(100000),exportTariffMinor:z.number().int().min(0).max(100000)}).strict().refine(p=>p.minSocPct<p.maxSocPct,'Minimum SOC must be below maximum SOC');
const defaults={capacityWh:120000,minSocPct:20,maxSocPct:95,maxChargeW:40000,maxDischargeW:30000,auxiliaryW:500,importTariffMinor:0,exportTariffMinor:0};
const delta=(current:string|undefined,previous:string|undefined,power:number,duration:number)=>current&&previous&&BigInt(current)>=BigInt(previous)?BigInt(current)-BigInt(previous):BigInt(Math.max(0,Math.round(power*duration/3600)));
export async function recordStationEnergy(tx:Prisma.TransactionClient,stationId:string,sample:TelemetrySample,message:Telemetry){
  const previous=await tx.stationEnergySample.findFirst({where:{stationId},orderBy:{recordedAt:'desc'},include:{telemetry:true}}),prev=(previous?.telemetry.measurements??{}) as Partial<Telemetry>;
  const duration=Math.max(0,Math.min(300000,previous?sample.recordedAt.getTime()-previous.recordedAt.getTime():0)),policy=await tx.stationEnergyPolicy.findUnique({where:{stationId}})??defaults;
  const ev=delta(message.stationEvEnergyMWh??message.energyMWh,prev.stationEvEnergyMWh??prev.energyMWh,message.chargingPowerW,duration);
  const solar=delta(message.solarEnergyMWh,prev.solarEnergyMWh,message.solarPowerW,duration);
  const imported=delta(message.gridImportEnergyMWh,prev.gridImportEnergyMWh,message.gridImportPowerW??(message.source==='GRID'?message.chargingPowerW:0),duration);
  const exported=delta(message.gridExportEnergyMWh,prev.gridExportEnergyMWh,message.gridExportPowerW??0,duration);
  await tx.stationEnergySample.create({data:{stationId,telemetryId:sample.id,recordedAt:sample.recordedAt,durationMs:duration,solarMWh:solar,evMWh:ev,importMWh:imported,exportMWh:exported,batterySocPct:message.stationBatteryPercent??0,batteryPowerW:message.stationBatteryPowerW??0,importTariffMinor:policy.importTariffMinor,exportTariffMinor:policy.exportTariffMinor,dataSource:message.dataSource}});
}
const number=(v:bigint)=>{const n=Number(v);if(!Number.isSafeInteger(n))throw new ApiError(500,'ENERGY_RANGE','Energy history is outside safe display precision');return n;};
const source=(s:string)=>s==='SIMULATOR'||s==='DIGITAL_TWIN'?'digital_twin':s==='LIVE_HARDWARE'?'live':'estimated';
export class EnergyService{
 constructor(private db:Database){}
 async get(stationId:string,from?:Date,to=new Date()){
  const station=await this.db.station.findUniqueOrThrow({where:{id:stationId},include:{primaryDevice:true,energyPolicy:true}}),policy=station.energyPolicy??defaults;
  const start=from??new Date(to.getTime()-30*86400000),latest=await this.db.stationEnergySample.findFirst({where:{stationId},orderBy:{recordedAt:'desc'},include:{telemetry:true}});
  const rows=await this.db.stationEnergySample.findMany({where:{stationId,recordedAt:{gte:start,lte:to}},orderBy:{recordedAt:'asc'},take:10000});
  const today=new Date(to);today.setUTCHours(0,0,0,0);const daily=rows.filter(r=>r.recordedAt>=today),sum=(key:'solarMWh'|'evMWh'|'importMWh'|'exportMWh')=>daily.reduce((n,r)=>n+r[key],0n);
  const m=(latest?.telemetry.measurements??{}) as Partial<Telemetry>,fresh=latest&&to.getTime()-latest.recordedAt.getTime()<30000;
  const current={timestamp:(latest?.recordedAt??to).toISOString(),stationId,telemetrySource:source(latest?.dataSource??'ESTIMATED'),solar:{voltageV:(m.solarVoltageMv??0)/1000,currentA:(m.solarCurrentMa??0)/1000,powerKw:(m.solarPowerW??0)/1000,energyTodayKwh:number(sum('solarMWh'))/1e6},battery:{socPct:latest?.batterySocPct??0,capacityKwh:policy.capacityWh/1000,availableKwh:Math.max(0,(latest?.batterySocPct??0)-policy.minSocPct)/100*policy.capacityWh/1000,powerKw:(latest?.batteryPowerW??0)/1000,state:(latest?.batteryPowerW??0)>0?'charging':(latest?.batteryPowerW??0)<0?'discharging':'idle'},evLoad:{powerKw:(m.chargingPowerW??0)/1000,energyTodayKwh:number(sum('evMWh'))/1e6,activeSessions:await this.db.chargingSession.count({where:{stationId,completedAt:null}})},grid:{importPowerKw:(m.gridImportPowerW??(m.source==='GRID'?m.chargingPowerW:0)??0)/1000,exportPowerKw:(m.gridExportPowerW??0)/1000,importEnergyTodayKwh:number(sum('importMWh'))/1e6,exportEnergyTodayKwh:number(sum('exportMWh'))/1e6},finance:{importCostMinor:number(daily.reduce((n,r)=>n+r.importMWh*BigInt(r.importTariffMinor),0n)/1000000n),exportEarningsMinor:number(daily.reduce((n,r)=>n+r.exportMWh*BigInt(r.exportTariffMinor),0n)/1000000n)},controller:{status:fresh&&station.primaryDevice?.status==='ONLINE'?'online':'offline',lastSeenAt:(station.primaryDevice?.lastSeenAt??new Date(0)).toISOString()},auxiliaryKw:(m.auxiliaryPowerW??policy.auxiliaryW)/1000,curtailedKw:0};
  const buckets=new Map<string,typeof rows>();for(const row of rows){const at=new Date(Math.floor(row.recordedAt.getTime()/3600000)*3600000).toISOString();buckets.set(at,[...(buckets.get(at)??[]),row]);}
  const history=[...buckets].map(([at,values])=>{const total=(k:'solarMWh'|'evMWh'|'importMWh'|'exportMWh')=>number(values.reduce((n,r)=>n+r[k],0n));const durationMs=values.reduce((n,r)=>n+r.durationMs,0);return{at,durationMs,solarMWh:total('solarMWh'),evMWh:total('evMWh'),importMWh:total('importMWh'),exportMWh:total('exportMWh'),importNumerator:values.reduce((n,r)=>n+number(r.importMWh)*r.importTariffMinor,0),exportNumerator:values.reduce((n,r)=>n+number(r.exportMWh)*r.exportTariffMinor,0),batterySocPct:values.at(-1)?.batterySocPct??0,batteryKwMs:values.reduce((n,r)=>n+r.batteryPowerW/1000*r.durationMs,0),source:source(values.at(-1)?.dataSource??'ESTIMATED')}});
  return {stationId,policy:{capacityKwh:policy.capacityWh/1000,minSocPct:policy.minSocPct,maxSocPct:policy.maxSocPct,maxChargeKw:policy.maxChargeW/1000,maxDischargeKw:policy.maxDischargeW/1000,auxiliaryKw:policy.auxiliaryW/1000,importTariffMinor:policy.importTariffMinor,exportTariffMinor:policy.exportTariffMinor},current,history,samples:[current]};
 }
 async update(stationId:string,input:unknown,ctx:AuditContext){
  const p=policySchema.parse(input);
  await this.db.$transaction(async tx=>{
   await tx.station.findUniqueOrThrow({where:{id:stationId}});
   const before=await tx.stationEnergyPolicy.findUnique({where:{stationId}});
   const data={capacityWh:Math.round(p.capacityKwh*1000),minSocPct:p.minSocPct,maxSocPct:p.maxSocPct,maxChargeW:Math.round(p.maxChargeKw*1000),maxDischargeW:Math.round(p.maxDischargeKw*1000),auxiliaryW:Math.round(p.auxiliaryKw*1000),importTariffMinor:p.importTariffMinor,exportTariffMinor:p.exportTariffMinor};
   const after=await tx.stationEnergyPolicy.upsert({where:{stationId},create:{stationId,...data},update:data});
   await writeAudit(tx,ctx,'ENERGY_POLICY_UPDATED','Station',stationId,before,after);
  });
  // Read the committed policy and current snapshot outside the transaction so the
  // response can never observe the previous policy through another connection.
  return this.get(stationId);
 }
}
