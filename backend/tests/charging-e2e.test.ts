import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DecodedIdToken } from 'firebase-admin/auth';
import request from 'supertest';
import { isolatedDatabase } from './helpers/database.js';
import { chargingFixture,deviceKey } from './helpers/charging.js';
import { socketClient } from './helpers/socket.js';
import { DeviceIngress } from '../src/modules/iot/ingress.js';
import { MqttGateway } from '../src/modules/iot/gateway.js';
import { ChargingEngine } from '../src/modules/sessions/engine.js';
import { readIotConfig } from '../src/config/iot.js';
import { startSimulator } from '../src/modules/simulator/mqtt.js';
import { attachRealtime } from '../src/modules/realtime/server.js';
import { createApp,finishApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { mountApi } from '../src/routes.js';
const url=process.env.TEST_DATABASE_URL,mqttUrl=process.env.MQTT_TEST_URL;
const until=async(check:()=>Promise<boolean>)=>{const end=Date.now()+12000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,40));}throw new Error('Integration condition timed out');};
describe.skipIf(!url||!mqttUrl)('real MQTT simulator to REST and WebSocket',()=>{
 let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
 beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>ctx?.close());
 it('reserves Credits, charges, unplugs, settles once and updates owner/admin',async()=>{
  const f=await chargingFixture(ctx.db),config=readIotConfig({NODE_ENV:'test',ALLOW_DEVICE_SIMULATOR:'true',MQTT_URL:mqttUrl,MQTT_TLS_ENABLED:'false',MQTT_CLIENT_ID:`test-${crypto.randomUUID()}`,TELEMETRY_INTERVAL_MS:'100'});
  await ctx.db.bay.update({where:{id:f.bay.id},data:{plugConnected:false,lastTelemetryAt:null}});
  const ingress:DeviceIngress=new DeviceIngress(ctx.db,config,f.bus,(id,m)=>engine.handle(id,m),()=>deviceKey),gateway=new MqttGateway(config,ingress),engine:ChargingEngine=new ChargingEngine(ctx.db,config,f.bus,gateway,()=>deviceKey);
  const verify=async(token:string)=>{if(![f.owner.firebaseUid,f.admin.firebaseUid].includes(token))throw new Error('Bad token');return {uid:token,exp:Math.floor(Date.now()/1000)+3600} as DecodedIdToken;};
  const app=createApp(envSchema.parse({DATABASE_URL:url,CORS_ORIGINS:'http://localhost:3000',FIREBASE_PROJECT_ID:'test',LOG_LEVEL:'silent'}));mountApi(app,ctx.db,verify,undefined,engine);finishApp(app);const server=createServer(app),realtime=attachRealtime(server,ctx.db,verify,f.bus,['http://localhost:3000']);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/realtime`,owner=socketClient(address),admin=socketClient(address);
  let simulator:ReturnType<typeof startSimulator>|undefined;
  try{
   await Promise.all([owner.authenticate(f.owner.firebaseUid),admin.authenticate(f.admin.firebaseUid)]);await admin.subscribe('admin');gateway.start();await until(async()=>gateway.ready());
   simulator=startSimulator({url:mqttUrl!,secret:deviceKey,stationId:f.station.code,deviceId:f.device.publicId,bayId:f.bay.code,relayChannel:1,speed:1,scenario:'unplug',intervalMs:100,allowed:true,nodeEnv:'test'});
   await until(async()=>!!(await ctx.db.bay.findUnique({where:{id:f.bay.id}}))?.plugConnected);
   const response=await request(app).post('/api/v1/charging-sessions/start').set('Authorization',`Bearer ${f.owner.firebaseUid}`).set('Idempotency-Key','e2e-start').send(f.input);expect(response.status).toBe(202);const id=response.body.data.id as string;
   await engine.dispatch();await owner.waitFor(m=>m.type==='command.acknowledged');await owner.waitFor(m=>m.type==='session.telemetry');
   const energy=await request(app).get(`/api/v1/admin/stations/${f.station.id}/energy`).set('Authorization',`Bearer ${f.admin.firebaseUid}`);expect(energy.status).toBe(200);expect(energy.body.data.current.telemetrySource).toBe('digital_twin');expect(energy.body.data.current.solar.powerKw).toBeGreaterThan(0);
   const policy=await request(app).put(`/api/v1/admin/stations/${f.station.id}/energy-policy`).set('Authorization',`Bearer ${f.admin.firebaseUid}`).send({capacityKwh:120,minSocPct:20,maxSocPct:95,maxChargeKw:40,maxDischargeKw:30,auxiliaryKw:.5,importTariffMinor:1200,exportTariffMinor:900});expect(policy.status).toBe(200);
   await until(async()=>!!(await ctx.db.chargingSession.findUnique({where:{id}}))?.completedAt);
   const session=await ctx.db.chargingSession.findUniqueOrThrow({where:{id}});expect(session.stopReason).toBe('PLUG_DISCONNECTED');expect(session.costMinor).toBeGreaterThan(0n);expect(session.costMinor).toBeLessThanOrEqual(1000n);expect(session.receipt).toMatchObject({dataSource:'SIMULATOR',confirmed:true});
   expect((await ctx.db.wallet.findUniqueOrThrow({where:{userId:f.owner.id}})).balanceMinor).toBe(1000n-session.costMinor);expect((await ctx.db.creditReservation.findUniqueOrThrow({where:{sessionId:id}})).status).toBe('SETTLED');expect(await ctx.db.walletLedger.count({where:{sessionId:id,kind:'CHARGING_DEBIT'}})).toBe(1);
   const fault=await ctx.db.fault.create({data:{deviceId:f.device.id,bayId:f.bay.id,code:'E2E_INSPECTION',message:'Test inspection fault'}});
   const acknowledged=await request(app).post(`/api/v1/admin/faults/${fault.id}/acknowledge`).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','e2e-fault-ack').send({confirmed:true,reason:'Operator accepted the inspection task'});expect(acknowledged.status).toBe(200);expect(acknowledged.body.data.status).toBe('ACKNOWLEDGED');
   const resolved=await request(app).post(`/api/v1/admin/faults/${fault.id}/resolve`).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','e2e-fault-resolve').send({confirmed:true,reason:'Physical inspection completed safely'});expect(resolved.status).toBe(200);expect(resolved.body.data.status).toBe('RESOLVED');
   await owner.waitFor(m=>m.type==='session.stopped');await admin.waitFor(m=>m.type==='session.stopped');
  }finally{await simulator?.close();await gateway.close();owner.ws.terminate();admin.ws.terminate();await realtime.close();await new Promise<void>(r=>server.close(()=>r()));}
 },25000);
});
