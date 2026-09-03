import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import request from 'supertest';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { isolatedDatabase } from './helpers/database.js';
import { chargingFixture } from './helpers/charging.js';
import { createApp,finishApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { mountApi } from '../src/routes.js';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('admin charging operations',()=>{
 let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
 beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>ctx?.close());
 async function setup(){const f=await chargingFixture(ctx.db),app=createApp(envSchema.parse({DATABASE_URL:url,CORS_ORIGINS:'http://localhost:3000',FIREBASE_PROJECT_ID:'test',LOG_LEVEL:'silent'}));mountApi(app,ctx.db,async token=>{if(![f.owner.firebaseUid,f.admin.firebaseUid].includes(token))throw new Error('Invalid');return {uid:token} as DecodedIdToken;},undefined,f.engine);finishApp(app);return {...f,app};}
 it('requires role, confirmation, reason, key and audits one idempotent command',async()=>{
  const f=await setup(),path=`/api/v1/admin/devices/${f.device.id}/commands`,body={type:'TEST',confirmed:true,reason:'Verify device diagnostics'};
  expect((await request(f.app).post(path).set('Authorization',`Bearer ${f.owner.firebaseUid}`).set('Idempotency-Key','test-command').send(body)).status).toBe(403);
  expect((await request(f.app).post(path).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','test-command').send({type:'TEST'})).status).toBe(400);
  const first=await request(f.app).post(path).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','test-command').send(body);expect(first.status).toBe(202);
  const second=await request(f.app).post(path).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','test-command').send(body);expect(second.body.data.id).toBe(first.body.data.id);expect(await ctx.db.auditLog.count({where:{actorId:f.admin.id,action:'DEVICE_COMMAND'}})).toBe(1);
  expect((await request(f.app).post(path).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','test-command').send({...body,type:'RESTART'})).status).toBe(409);
 });
 it('audits admin stop and rejects restart while charging',async()=>{
  const f=await setup(),s=await f.start();await f.ack(s.id);
  const maintenance=await request(f.app).post(`/api/v1/admin/devices/${f.device.id}/commands`).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','restart-active').send({type:'RESTART',confirmed:true,reason:'Restart for diagnostics'});expect(maintenance.status).toBe(409);
  const stop=await request(f.app).post(`/api/v1/admin/charging-sessions/${s.id}/stop`).set('Authorization',`Bearer ${f.admin.firebaseUid}`).set('Idempotency-Key','admin-stop').send({confirmed:true,reason:'Operator requested safety stop'});expect(stop.status).toBe(202);expect(stop.body.data.stopReason).toBe('ADMIN_STOPPED');expect(await ctx.db.auditLog.findFirst({where:{actorId:f.admin.id,targetId:s.id,reason:'Operator requested safety stop'}})).not.toBeNull();
 });
 it('rejects owner stop of another user session',async()=>{const f=await setup(),other=await chargingFixture(ctx.db),s=await other.start();const result=await request(f.app).post(`/api/v1/charging-sessions/${s.id}/stop`).set('Authorization',`Bearer ${f.owner.firebaseUid}`).set('Idempotency-Key','foreign-stop').send({});expect(result.status).toBe(404);});
});

