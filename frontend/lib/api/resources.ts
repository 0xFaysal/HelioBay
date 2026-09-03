import { z } from "zod";
import { createApiClient, type ApiClientOptions } from "./client.ts";
import { seed } from "../credit/seed.ts";
import { snapshotSchema, type Snapshot, type Session, type Payment, type User, type Station, type Bay, type Device, type Command } from "../credit/model.ts";
import {stationEnergySchema}from"../energy/model.ts";

// Decimal strings are converted only after proving exact integer representability.
export const minorText = z.string().regex(/^-?\d+$/).transform(Number).refine(Number.isSafeInteger, "Amount exceeds safe display precision");
const iso = z.string().datetime({offset:true});
const source = z.enum(["LIVE_HARDWARE","SIMULATOR","DIGITAL_TWIN","ESTIMATED"]);
const connector = z.enum(["CCS2","TYPE_2","CHADEMO","AC_SOCKET"]);
const nullableText = z.string().nullable();
export const resourceUser = z.object({id:z.string(),name:z.string(),email:nullableText,phone:nullableText,city:nullableText,role:z.enum(["ADMIN","EV_OWNER"]),status:z.enum(["ACTIVE","BLOCKED","DISABLED"]),preferences:z.object({charging:z.boolean(),wallet:z.boolean(),offers:z.boolean()}),savedStations:z.array(z.string()),wallet:z.object({balanceMinor:minorText}).nullable().optional()});
export const resourceVehicle = z.object({id:z.string(),ownerId:z.string(),name:z.string(),plate:z.string(),capacityWh:z.number().int(),estimatedSocPct:z.number().int().min(0).max(100),connectorType:connector,isDefault:z.boolean()});
export const resourceDevice = z.object({id:z.string(),publicId:z.string(),stationId:z.string().optional(),status:z.string(),lastSeenAt:iso.nullable(),firmwareVersion:nullableText,dataSource:source});
export const resourceStation = z.object({id:z.string(),code:z.string(),name:z.string(),address:z.string(),latitude:z.number(),longitude:z.number(),status:z.string(),isOpen:z.boolean(),openingHours:nullableText,solarCapable:z.boolean(),batteryCapable:z.boolean(),primaryDevice:resourceDevice.nullable(),tariff:z.object({id:z.string(),priceMinorPerKwh:z.number().int()}),distanceKm:z.number().optional()});
export const resourceBay = z.object({id:z.string(),code:z.string(),stationId:z.string(),deviceId:z.string(),number:z.number().int(),relayChannel:z.number().int(),connectorType:connector,enabled:z.boolean(),status:z.string(),plugConnected:z.boolean(),maxPowerW:z.number().int()});
export const resourceWallet = z.object({userId:z.string(),balanceMinor:minorText,heldMinor:minorText,availableMinor:minorText});
export const resourcePayment = z.object({transactionId:z.string(),userId:z.string(),status:z.enum(["PENDING","VALIDATING","PAID","VERIFIED","FAILED","CANCELLED","EXPIRED","RISK_REVIEW","REVERSED"]),amountMinor:minorText,isSandbox:z.boolean(),createdAt:iso,verifiedAt:iso.nullable(),providerReference:nullableText.optional(),GatewayPageURL:nullableText.optional()});
export const resourceLedger = z.object({id:z.string(),wallet:z.object({userId:z.string()}),kind:z.enum(["TOP_UP","CHARGING_DEBIT","ADJUSTMENT","ADMIN_CREDIT","ADMIN_DEBIT","REFUND","RESERVATION","RESERVATION_RELEASE","REVERSAL","DEMO_CREDIT"]),amountMinor:minorText,balanceAfterMinor:minorText,reference:z.string(),reason:nullableText,description:z.string(),isSandbox:z.boolean(),createdAt:iso,paymentId:nullableText,sessionId:nullableText});
const resourceCommand = z.object({id:z.string(),sessionId:nullableText,bayId:nullableText,deviceId:z.string(),actorId:z.string(),type:z.enum(["START","STOP","EMERGENCY_STOP","TEST","RESTART"]),status:z.enum(["PENDING","ACKNOWLEDGED","FAILED","TIMED_OUT"]),issuedAt:iso,expiresAt:iso,failureCode:nullableText});
const meter = z.object({recordedAt:iso,energyMWh:minorText,powerW:z.number().nullable(),voltageMv:z.number().nullable(),currentMa:z.number().nullable(),source:z.string(),simulated:z.boolean(),measurements:z.object({vehicleBatteryPercent:z.number().nullable().optional(),source:z.enum(["SOLAR","STORAGE","GRID"]).optional()}).nullable()});
export const resourceSession = z.object({id:z.string(),ownerId:z.string(),stationId:z.string(),bayId:z.string(),deviceId:z.string(),vehicleId:z.string(),status:z.enum(["CREATED","AWAITING_PLUG","READY","START_PENDING","STOP_PENDING","INTERRUPTED","PENDING","STARTING","CHARGING","STOPPING","COMPLETED","FAILED"]),createdAt:iso,updatedAt:iso,startedAt:iso.nullable(),completedAt:iso.nullable(),stopReason:nullableText,energyMWh:minorText,costMinor:minorText,reservedMinor:minorText,endingBalanceMinor:minorText.nullable(),tariffMinorPerKwh:z.number().int(),reconciliationRequired:z.boolean(),dataSource:source,receipt:z.object({confirmed:z.boolean()}).passthrough().nullable(),vehicle:resourceVehicle,telemetry:z.array(meter),events:z.array(z.object({createdAt:iso,type:z.string(),data:z.unknown()})),commands:z.array(resourceCommand)});
export const resourceFault = z.object({id:z.string(),deviceId:z.string(),bayId:nullableText,code:z.string(),message:z.string(),status:z.enum(["OPEN","ACKNOWLEDGED","RESOLVED"]),createdAt:iso});
export const resourceNotification=z.object({id:z.string(),userId:z.string(),type:z.string(),title:z.string(),message:z.string(),reference:nullableText,readAt:iso.nullable(),createdAt:iso});
export const resourceAudit = z.object({id:z.string(),actorId:z.string(),action:z.string(),targetId:z.string(),reason:nullableText,createdAt:iso});
export const resourceTariff = z.object({id:z.string(),name:z.string(),priceMinorPerKwh:z.number().int(),active:z.boolean()});
export const mapUser = (u:z.infer<typeof resourceUser>):User => ({id:u.id,name:u.name,email:u.email??"",phone:u.phone??"",city:u.city??"",role:u.role==="ADMIN"?"admin":"owner",status:u.status==="ACTIVE"?"active":"blocked",preferences:u.preferences,savedStations:u.savedStations});
const mapConnector = (c:z.infer<typeof connector>) => c==="TYPE_2" ? "Type 2" as const : c;
export const mapVehicle = (v:z.infer<typeof resourceVehicle>) => ({id:v.id,ownerId:v.ownerId,name:v.name,plate:v.plate,capacityWh:v.capacityWh,battery:v.estimatedSocPct,connector:mapConnector(v.connectorType),isDefault:v.isDefault});
export function mapPayment(p:z.infer<typeof resourcePayment>):Payment { const statuses={PENDING:"pending",VALIDATING:"validating",PAID:"verified",VERIFIED:"verified",FAILED:"failed",CANCELLED:"cancelled",EXPIRED:"expired",RISK_REVIEW:"risk-review",REVERSED:"reversed"} as const;return {id:p.transactionId,userId:p.userId,amountMinor:p.amountMinor,status:statuses[p.status],sandbox:p.isSandbox,createdAt:p.createdAt,verifiedAt:p.verifiedAt??undefined,providerReference:p.providerReference??undefined,requestId:p.transactionId}; }
export function mapCommand(c:z.infer<typeof resourceCommand>):Command {return {id:c.id,sessionId:c.sessionId??undefined,bayId:c.bayId??undefined,deviceId:c.deviceId,actorId:c.actorId,command:c.type,status:({PENDING:"pending",ACKNOWLEDGED:"acknowledged",FAILED:"failed",TIMED_OUT:"timed-out"} as const)[c.status],issuedAt:c.issuedAt,expiresAt:c.expiresAt,outcome:c.status==="TIMED_OUT"?"timeout":c.status==="FAILED"?"failure":"success",message:c.failureCode??c.status};}
export function mapSession(s:z.infer<typeof resourceSession>):Session {
  const points=s.telemetry.slice().reverse().map(t=>({at:t.recordedAt,voltage:t.voltageMv===null?null:t.voltageMv/1000,current:t.currentMa===null?null:t.currentMa/1000,powerW:t.powerW,energyMWh:t.energyMWh,battery:t.measurements?.vehicleBatteryPercent??null,source:t.measurements?.source??"GRID" as const,simulated:t.simulated}));
  const completed=Boolean(s.completedAt && s.receipt?.confirmed);
  const stopReasons:Record<string,Session["stopReason"]>={SAFETY_FAULT:"FAULT",MAX_ENERGY_REACHED:"CREDIT_EXHAUSTED",MAX_DURATION_REACHED:"USER_STOPPED",BATTERY_FULL:"BATTERY_FULL",CREDIT_EXHAUSTED:"CREDIT_EXHAUSTED",PLUG_DISCONNECTED:"PLUG_DISCONNECTED",USER_STOPPED:"USER_STOPPED",ADMIN_STOPPED:"ADMIN_STOPPED",EMERGENCY_STOP:"EMERGENCY_STOP",DEVICE_OFFLINE:"DEVICE_OFFLINE"};
  return {id:s.id,ownerId:s.ownerId,stationId:s.stationId,bayId:s.bayId,deviceId:s.deviceId,vehicleId:s.vehicleId,state:completed?"completed":s.status==="CHARGING"?"charging":"pending",backendStatus:s.status,reconciliationRequired:s.reconciliationRequired,dataSource:s.dataSource,receiptConfirmed:completed,createdAt:s.createdAt,startedAt:s.startedAt??undefined,updatedAt:s.updatedAt,completedAt:s.completedAt??undefined,stopReason:s.stopReason?stopReasons[s.stopReason]??"FAULT":undefined,initialBattery:s.vehicle.estimatedSocPct,battery:points.at(-1)?.battery??s.vehicle.estimatedSocPct,targetBattery:100,energyMWh:s.energyMWh,elapsedMs:s.startedAt?Math.max(0,Date.parse(s.completedAt??s.updatedAt)-Date.parse(s.startedAt)):0,tariffMinor:s.tariffMinorPerKwh,startingBalanceMinor:s.reservedMinor,reservedMinor:s.reservedMinor,costMinor:s.costMinor,endingBalanceMinor:s.endingBalanceMinor??undefined,commandId:s.commands[0]?.id??s.id,points,events:s.events.slice().reverse().map(e=>({at:e.createdAt,message:e.type}))};
}

export function createResources(options:ApiClientOptions) {
  const request=createApiClient({...options,envelope:true});
  async function all<T>(path:string,schema:z.ZodType<T>,signal?:AbortSignal):Promise<T[]> {
    const rows:T[]=[];
    for(let page=1;page<=100;page++){ const chunk=await request(`${path}${path.includes("?")?"&":"?"}page=${page}&limit=100`,z.array(schema),{signal});rows.push(...chunk);if(chunk.length<100)return rows; }
    throw new Error("This view exceeds 10,000 records. Use a narrower server-side filter.");
  }
  async function directory(signal?:AbortSignal,location?:{lat:number;lng:number}) {
    const stations=location?await request(`/stations/nearest?lat=${location.lat}&lng=${location.lng}&radiusKm=200&limit=100`,z.array(resourceStation),{signal}):await all("/stations",resourceStation,signal);
    const bays=(await Promise.all(stations.map(s=>all(`/stations/${encodeURIComponent(s.id)}/bays`,resourceBay,signal)))).flat();
    const mappedBays:Bay[]=bays.map(b=>({id:b.id,stationId:b.stationId,deviceId:b.deviceId,number:b.number,relayChannel:b.relayChannel,connector:mapConnector(b.connectorType),enabled:b.enabled,plugged:b.plugConnected,fault:b.status==="FAULT",reportedState:b.status}));
    const mappedStations:Station[]=stations.map(s=>({id:s.id,code:s.code,tariffId:s.tariff.id,name:s.name,address:s.address,landmark:"",lat:s.latitude,lng:s.longitude,deviceId:s.primaryDevice?.id??`unassigned-${s.id}`,online:s.status==="ONLINE"&&s.isOpen,priceMinor:s.tariff.priceMinorPerKwh,powerKw:Math.max(1,...bays.filter(b=>b.stationId===s.id).map(b=>b.maxPowerW/1000)),solarPercent:0,image:"/images/station.webp",amenities:[...(s.solarCapable?["Solar capable"]:[]),...(s.batteryCapable?["Battery storage"]:[])],openingHours:s.openingHours??"Contact station for hours",distanceKm:s.distanceKm}));
    const devices:Device[]=stations.flatMap(s=>s.primaryDevice?[{id:s.primaryDevice.id,publicId:s.primaryDevice.publicId,stationId:s.id,online:s.primaryDevice.status==="ONLINE",lastSeen:s.primaryDevice.lastSeenAt??new Date(0).toISOString(),firmware:s.primaryDevice.firmwareVersion??"Not reported",dataSource:s.primaryDevice.dataSource,stationBattery:0,solarW:0,gridBackup:false,gridExport:false,outcome:"success" as const}]:[]);
    return {stations:mappedStations,bays:mappedBays,devices};
  }
  async function load(role:"owner"|"admin",signal?:AbortSignal):Promise<Snapshot> {
    const data=seed(new Date().toISOString(),true);
    const [places,me,vehicles,wallet,sessions,ledger,payments,notifications] = await Promise.all([directory(signal),request("/me",resourceUser,{signal}),all("/me/vehicles",resourceVehicle,signal),request("/me/wallet",resourceWallet,{signal}),all(role==="admin"?"/admin/charging-sessions":"/me/charging-sessions",resourceSession,signal),all(role==="admin"?"/admin/wallet-ledger":"/me/wallet/ledger",resourceLedger,signal),all(role==="admin"?"/admin/payments":"/me/payments",resourcePayment,signal),all("/me/notifications",resourceNotification,signal)]);
    Object.assign(data,places);data.users=[mapUser(me)];data.vehicles=vehicles.map(mapVehicle);data.wallets=[wallet];data.sessions=sessions.map(mapSession);data.commands=sessions.flatMap(s=>s.commands.map(mapCommand));
    for(const s of sessions)if(!data.vehicles.some(v=>v.id===s.vehicleId))data.vehicles.push(mapVehicle(s.vehicle));
    data.ledger=ledger.map(l=>({id:l.id,userId:l.wallet.userId,kind:({TOP_UP:"top-up",CHARGING_DEBIT:"charging-debit",ADJUSTMENT:"adjustment",ADMIN_CREDIT:"adjustment",ADMIN_DEBIT:"adjustment",DEMO_CREDIT:"adjustment",REVERSAL:"reversal",REFUND:"refund",RESERVATION:"reservation",RESERVATION_RELEASE:"reservation-release"} as const)[l.kind],amountMinor:l.amountMinor,balanceAfterMinor:l.balanceAfterMinor,reference:l.paymentId??l.sessionId??l.reference,reason:l.reason??l.description,status:"posted",sandbox:l.isSandbox,at:l.createdAt}));
    data.payments=payments.map(mapPayment);data.notifications=notifications.map(n=>({id:n.id,userId:n.userId,type:n.type,title:n.title,message:n.message,reference:n.reference??undefined,readAt:n.readAt??undefined,createdAt:n.createdAt}));
    if(role==="admin") {
      const [users,faults,audit,controllers]=await Promise.all([all("/admin/users",resourceUser,signal),all("/admin/faults",resourceFault,signal),all("/admin/audit-logs",resourceAudit,signal),all("/admin/devices",resourceDevice,signal)]);
      data.users=users.map(mapUser);data.wallets=await Promise.all(users.map(u=>request(`/admin/users/${encodeURIComponent(u.id)}/wallet`,resourceWallet,{signal})));
      data.devices=controllers.map(d=>({...data.devices.find(p=>p.id===d.id),id:d.id,publicId:d.publicId,stationId:d.stationId!,online:d.status==="ONLINE",lastSeen:d.lastSeenAt??new Date(0).toISOString(),firmware:d.firmwareVersion??"Not reported",dataSource:d.dataSource,stationBattery:0,solarW:0,gridBackup:false,gridExport:false,outcome:"success"}));
      data.faults=faults.map(f=>({id:f.id,deviceId:f.deviceId,stationId:data.devices.find(d=>d.id===f.deviceId)?.stationId??"unassigned",bayId:f.bayId??undefined,message:f.message,status:({OPEN:"open",ACKNOWLEDGED:"acknowledged",RESOLVED:"resolved"} as const)[f.status],severity:"critical",at:f.createdAt,note:f.code}));
      data.audit=audit.map(a=>({id:a.id,actorId:a.actorId,action:a.action,reference:a.targetId,reason:a.reason??"",at:a.createdAt}));
      data.energy=await Promise.all(data.stations.map(s=>request(`/admin/stations/${encodeURIComponent(s.id)}/energy`,stationEnergySchema,{signal})));
    }
    data.policy.communicationTimeoutMs=30000;
    return snapshotSchema.parse(data);
  }
  return {request,all,directory,load};
}
