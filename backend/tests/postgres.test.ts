import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import request from 'supertest';
import type { Express } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { makeDatabase, type Database } from '../src/shared/database/client.js';
import { createApp, finishApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { mountApi } from '../src/routes.js';

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL migrations and API integration', () => {
  const schema = `hbtest_${randomUUID().replaceAll('-','')}`;
  let pool: Pool, db: Database, app: Express;
  let ownerId: string, adminId: string, stationId: string, deviceId: string, bayId: string, tariffId: string;
  beforeAll(async () => {
    if (!new URL(url!).pathname.endsWith('_test')) throw new Error('TEST_DATABASE_URL database name must end with _test');
    pool = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const dir of (await readdir('prisma/migrations')).filter(n => /^\d/.test(n)).sort()) await pool.query(await readFile(`prisma/migrations/${dir}/migration.sql`, 'utf8'));
    db = makeDatabase(url!, schema);
    const admin = await db.user.create({ data: { firebaseUid: 'test-admin', name: 'Admin', role: 'ADMIN', wallet: { create: {} } } }); adminId=admin.id;
    const owner = await db.user.create({ data: { firebaseUid:'test-owner',name:'Owner',wallet:{create:{}} } }); ownerId=owner.id;
    tariffId = (await db.tariff.create({ data:{name:'Test',priceMinorPerKwh:2500} })).id;
    const station = await db.station.create({data:{code:'ST001',name:'Green Point',address:'Dhaka',latitude:23.7806,longitude:90.4193,tariffId}}); stationId=station.id;
    deviceId=(await db.device.create({data:{publicId:'ESP32-ST001',stationId,mqttClientId:'test-device',credentialRef:'secret://never-return'}})).id;
    await db.station.update({where:{id:stationId},data:{primaryDeviceId:deviceId}});
    bayId=(await db.bay.create({data:{code:'BAY01',stationId,deviceId,number:1,relayChannel:1,connectorType:'TYPE_2',maxPowerW:7000,status:'AVAILABLE'}})).id;
    await db.station.create({data:{code:'ST002',name:'Uttara',address:'Dhaka',latitude:23.8759,longitude:90.3795,tariffId}});
    const env=envSchema.parse({NODE_ENV:'test',DATABASE_URL:url,CORS_ORIGINS:'http://localhost:3000',FIREBASE_PROJECT_ID:'test',LOG_LEVEL:'silent'});
    app=createApp(env,()=>db.$queryRaw`SELECT 1`);
    mountApi(app, db, async token => { if(!['test-admin','test-owner','other-owner'].includes(token)) throw new Error('Invalid'); return {uid:token} as DecodedIdToken; });
    finishApp(app);
  }, 30000);
  afterAll(async () => { await db?.$disconnect(); if(pool) { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end(); } });
  const admin = () => request(app);
  it('calculates actual Haversine distance and sorts closest first', async () => {
    const res=await request(app).get('/api/v1/stations/nearest?lat=23.7806&lng=90.4193&radiusKm=25');
    expect(res.status).toBe(200); expect(res.body.data[0].code).toBe('ST001'); expect(res.body.data[0].distanceKm).toBeCloseTo(0,6); expect(res.body.data[1].distanceKm).toBeGreaterThan(10); expect(res.body.data[0].availableBays).toBe(1); expect(res.text).not.toContain('credentialRef'); expect(res.text).not.toContain('mqttClientId');
  });
  it('enforces ownership for vehicle mutations', async () => {
    const created=await request(app).post('/api/v1/me/vehicles').auth('test-owner',{type:'bearer'}).send({name:'EV',plate:'TEST',capacityWh:40000,connectorType:'TYPE_2'});
    expect(created.status).toBe(201);
    const res=await request(app).patch(`/api/v1/me/vehicles/${created.body.data.id}`).auth('other-owner',{type:'bearer'}).send({name:'Stolen'});
    expect(res.status).toBe(404);
  });
  it('updates bays and audits actual before/after state', async () => {
    const res=await admin().patch(`/api/v1/admin/bays/${bayId}`).auth('test-admin',{type:'bearer'}).send({data:{maxPowerW:7200}});
    expect(res.status).toBe(200);
    const log=await db.auditLog.findFirstOrThrow({where:{requestId:res.body.requestId}});
    expect(log.actorId).toBe(adminId); expect(log.before).toMatchObject({maxPowerW:7000}); expect(log.after).toMatchObject({maxPowerW:7200});
  });
  it('rejects a cross-station bay in both the service and database', async () => {
    const station=await db.station.findUniqueOrThrow({where:{code:'ST002'}});
    const data={code:'INVALID',stationId:station.id,deviceId,number:1,relayChannel:1,connectorType:'TYPE_2',maxPowerW:7000};
    const res=await admin().post('/api/v1/admin/bays').auth('test-admin',{type:'bearer'}).send({data}); expect(res.status).toBe(422);
    await expect(db.bay.create({data})).rejects.toThrow();
  });
  it('enforces channel uniqueness in PostgreSQL', async () => {
    await expect(db.bay.create({data:{code:'DUPLICATE',stationId,deviceId,number:2,relayChannel:1,connectorType:'TYPE_2',maxPowerW:7000}})).rejects.toThrow();
  });
  it('cannot reassign a primary device while bays refer to it', async () => {
    const res=await admin().patch(`/api/v1/admin/stations/${stationId}`).auth('test-admin',{type:'bearer'}).send({data:{primaryDeviceId:null}}); expect(res.status).toBe(409);
  });
  it('blocks and reactivates users with durable audit', async () => {
    const res=await admin().patch(`/api/v1/admin/users/${ownerId}`).auth('test-admin',{type:'bearer'}).send({status:'BLOCKED',reason:'Review account'}); expect(res.status).toBe(200);
    expect((await request(app).get('/api/v1/me').auth('test-owner',{type:'bearer'})).status).toBe(403);
    expect((await admin().patch(`/api/v1/admin/users/${ownerId}`).auth('test-admin',{type:'bearer'}).send({status:'ACTIVE',reason:'Review completed'})).status).toBe(200);
  });
  it('serializes wallet money without precision loss', async () => {
    const res=await request(app).get('/api/v1/me/wallet').auth('test-owner',{type:'bearer'}); expect(res.status).toBe(200); expect(res.body.data.balanceMinor).toBe('0');
  });
  it('makes audit rows immutable', async () => {
    const row=await db.auditLog.findFirstOrThrow(); await expect(db.auditLog.delete({where:{id:row.id}})).rejects.toThrow();
  });
  it('rejects negative monetary balances', async () => { await expect(db.wallet.update({where:{userId:ownerId},data:{balanceMinor:-1n}})).rejects.toThrow(); });
});
