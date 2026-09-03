import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { isolatedDatabase } from './helpers/database.js';
import { chargingFixture,deviceKey,telemetry } from './helpers/charging.js';
import { DeviceIngress } from '../src/modules/iot/ingress.js';
import { sign,topic,type DeviceMessage } from '../src/modules/iot/protocol.js';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('authenticated device ingestion',()=>{
 let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
 beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>ctx?.close());
 it('rejects spoofed identity, signature, source, duplicate and out-of-order data',async()=>{
  const f=await chargingFixture(ctx.db);const received:DeviceMessage[]=[];const ingress=new DeviceIngress(ctx.db,f.config,f.bus,async(_id,m)=>{received.push(m);},()=>deviceKey);
  const t=topic(f.station.code,f.device.publicId,'telemetry'),m={...telemetry(),bayId:f.bay.code,sequence:'1'};
  const send=(name:string,p:unknown,key=deviceKey)=>ingress.receive(name,Buffer.from(JSON.stringify({payload:p,signature:sign(name,p,key)})));
  expect(await send(t,m,'wrong-key')).toBe(false);expect(await send(topic('OTHER',f.device.publicId,'telemetry'),m)).toBe(false);expect(await send(t,{...m,dataSource:'LIVE_HARDWARE'})).toBe(false);expect(await send(t,m)).toBe(true);expect(await send(t,m)).toBe(false);expect(await send(t,{...m,sequence:'2',at:new Date(Date.now()-1000).toISOString()})).toBe(false);expect(await send(t,{...m,sequence:'0'})).toBe(false);expect(received).toHaveLength(1);
  expect(await ctx.db.telemetrySample.count({where:{deviceId:f.device.id}})).toBe(1);
 });
 it('persists accepted work across handler failure and retries without losing a final sample',async()=>{
  const f=await chargingFixture(ctx.db);let fail=true,calls=0;const ingress=new DeviceIngress(ctx.db,f.config,f.bus,async()=>{calls++;if(fail)throw new Error('Database transient failure');},()=>deviceKey);
  const p={...telemetry(),bayId:f.bay.code,sequence:'1',final:true},t=topic(f.station.code,f.device.publicId,'telemetry');
  await expect(ingress.receive(t,Buffer.from(JSON.stringify({payload:p,signature:sign(t,p,deviceKey)})))).rejects.toThrow();expect(await ctx.db.deviceInbox.count({where:{deviceId:f.device.id}})).toBe(1);fail=false;await ingress.drain();expect(calls).toBe(2);expect(await ctx.db.deviceInbox.count({where:{deviceId:f.device.id}})).toBe(0);
 });
});
