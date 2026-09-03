import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { isolatedDatabase } from './helpers/database.js';
import { chargingFixture } from './helpers/charging.js';
import { socketClient } from './helpers/socket.js';
import { attachRealtime } from '../src/modules/realtime/server.js';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('WebSocket authorization',()=>{
 let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
 beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>ctx?.close());
 it('scopes owners and admins, rejects forged rooms and closes blocked users',async()=>{
  const f=await chargingFixture(ctx.db),other=await chargingFixture(ctx.db),s=await f.start(),server=createServer();
  const realtime=attachRealtime(server,ctx.db,async token=>{if(![f.owner.firebaseUid,f.admin.firebaseUid,other.owner.firebaseUid].includes(token))throw new Error('Invalid');return {uid:token,exp:Math.floor(Date.now()/1000)+3600} as DecodedIdToken;},f.bus,['http://localhost:3000']);
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const endpoint=`ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/realtime`;
  const owner=socketClient(endpoint),admin=socketClient(endpoint),stranger=socketClient(endpoint);
  try{
   await Promise.all([owner.authenticate(f.owner.firebaseUid),admin.authenticate(f.admin.firebaseUid),stranger.authenticate(other.owner.firebaseUid)]);
   expect((await stranger.subscribe(`session:${s.id}`)).type).toBe('error');expect((await owner.subscribe('admin')).type).toBe('error');await admin.subscribe('admin');await stranger.subscribe(`station:${f.station.id}`);
   f.bus.publish({type:'session.telemetry',userId:f.owner.id,sessionId:s.id,data:{private:true}});f.bus.publish({type:'station.status',stationId:f.station.id,public:true,data:{online:true}});
   expect((await owner.waitFor(m=>m.type==='session.telemetry')).data).toEqual({private:true});await admin.waitFor(m=>m.type==='session.telemetry');await stranger.waitFor(m=>m.type==='station.status');expect(stranger.messages.some(m=>m.type==='session.telemetry')).toBe(false);
   await ctx.db.user.update({where:{id:f.owner.id},data:{status:'BLOCKED'}});const closed=new Promise<number>(r=>owner.ws.once('close',code=>r(code)));f.bus.publish({type:'session.telemetry',userId:f.owner.id,data:{private:true}});expect(await closed).toBe(4403);
  }finally{owner.ws.terminate();admin.ws.terminate();stranger.ws.terminate();await realtime.close();await new Promise<void>(r=>server.close(()=>r()));}
 });
});
