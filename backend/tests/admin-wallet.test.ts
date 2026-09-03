import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import request from 'supertest';
import { isolatedDatabase } from './helpers/database.js';
import { AdminWalletService } from '../src/modules/admin/wallet-service.js';
import { CreditReservations } from '../src/modules/wallets/reservations.js';
import { createApp,finishApp } from '../src/app.js';
import { mountApi } from '../src/routes.js';
import { envSchema } from '../src/config/env.js';
import type { DecodedIdToken } from 'firebase-admin/auth';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('admin wallet adjustments and reservations',()=>{
  let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
  beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>{await ctx?.close();});
  async function setup() {
    const owner=await ctx.db.user.create({data:{firebaseUid:crypto.randomUUID(),name:'Owner',wallet:{create:{}}}});
    const admin=await ctx.db.user.create({data:{firebaseUid:crypto.randomUUID(),name:'Admin',role:'ADMIN',wallet:{create:{}}}});
    return {owner,admin,service:new AdminWalletService(ctx.db)};
  }
  it('credits once and audits once despite concurrent retries',async()=>{
    const {owner,admin,service}=await setup();const body={kind:'ADMIN_CREDIT',amountMinor:'1000',reason:'Correction approved'};
    const entries=await Promise.all([1,2,3].map(()=>service.adjust(owner.id,body,'same-key',admin.id,'req1')));
    expect(new Set(entries.map(e=>e.id)).size).toBe(1);expect((await service.wallet(owner.id)).balanceMinor).toBe(1000n);
    expect(await ctx.db.auditLog.count({where:{targetId:entries[0]!.walletId}})).toBe(1);
    await expect(service.adjust(owner.id,{...body,amountMinor:'1001'},'same-key',admin.id,'req2')).rejects.toMatchObject({status:409});
  });
  it('rejects insufficient debit, missing reason and balance injection',async()=>{
    const {owner,admin,service}=await setup();
    await expect(service.adjust(owner.id,{kind:'ADMIN_DEBIT',amountMinor:'1000',reason:'Debit correction'},'debit-key',admin.id,'req')).rejects.toMatchObject({status:422});
    expect(()=>service.adjust(owner.id,{kind:'ADMIN_CREDIT',amountMinor:'1000'},'key',admin.id,'req')).toThrow();
    expect(()=>service.adjust(owner.id,{kind:'ADMIN_CREDIT',amountMinor:'1000',reason:'Bad request',balanceMinor:999},'key',admin.id,'req')).toThrow();
    expect((await service.wallet(owner.id)).balanceMinor).toBe(0n);
  });
  it('reverses through a new entry once and preserves the original',async()=>{
    const {owner,admin,service}=await setup();const credit=await service.adjust(owner.id,{kind:'ADMIN_CREDIT',amountMinor:1000,reason:'Credit correction'},'credit-key',admin.id,'req');
    const reversal=await service.adjust(owner.id,{kind:'REVERSAL',ledgerId:credit.id,reason:'Reverse mistaken credit'},'reverse-key',admin.id,'req');
    expect(reversal.amountMinor).toBe(-1000n);expect((await service.wallet(owner.id)).balanceMinor).toBe(0n);
    expect((await ctx.db.walletLedger.findUniqueOrThrow({where:{id:credit.id}})).amountMinor).toBe(1000n);
    await expect(service.adjust(owner.id,{kind:'REVERSAL',ledgerId:credit.id,reason:'Repeat reversal'},'other-key',admin.id,'req')).rejects.toMatchObject({status:409});
  });
  it('rolls back an adjustment when audit insertion fails',async()=>{
    const {owner,admin,service}=await setup();
    await ctx.pool.query(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END; $$; CREATE TRIGGER reject_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit();`);
    try { await expect(service.adjust(owner.id,{kind:'ADMIN_CREDIT',amountMinor:1000,reason:'Credit correction'},'rollback-key',admin.id,'req')).rejects.toThrow(); }
    finally { await ctx.pool.query('DROP TRIGGER reject_audit ON "AuditLog"; DROP FUNCTION reject_audit();'); }
    expect((await service.wallet(owner.id)).balanceMinor).toBe(0n);expect(await ctx.db.walletLedger.count({where:{wallet:{userId:owner.id}}})).toBe(0);
  });
  it('preserves held credits during debit and releases them with immutable events',async()=>{
    const {owner,admin,service}=await setup();await service.adjust(owner.id,{kind:'ADMIN_CREDIT',amountMinor:1000,reason:'Test funding'},'fund-key',admin.id,'req');
    const vehicle=await ctx.db.vehicle.create({data:{ownerId:owner.id,name:'EV',plate:'TEST',capacityWh:10000,connectorType:'TYPE_2'}});
    const tariff=await ctx.db.tariff.create({data:{name:'Test',priceMinorPerKwh:100}});
    const station=await ctx.db.station.create({data:{code:crypto.randomUUID(),name:'Test',address:'Dhaka',latitude:23,longitude:90,tariffId:tariff.id}});
    const device=await ctx.db.device.create({data:{stationId:station.id,publicId:crypto.randomUUID(),mqttClientId:crypto.randomUUID()}});
    await ctx.db.station.update({where:{id:station.id},data:{primaryDeviceId:device.id}});
    const bay=await ctx.db.bay.create({data:{code:crypto.randomUUID(),stationId:station.id,deviceId:device.id,number:1,relayChannel:1,connectorType:'TYPE_2',maxPowerW:1000}});
    const session=await ctx.db.chargingSession.create({data:{ownerId:owner.id,vehicleId:vehicle.id,stationId:station.id,deviceId:device.id,bayId:bay.id,tariffId:tariff.id,tariffMinorPerKwh:100,requestId:'session'}});
    const reservations=new CreditReservations(ctx.db);
    await reservations.reserve(owner.id,session.id,800n,'reserve-key',owner.id);
    expect((await service.wallet(owner.id)).availableMinor).toBe(200n);
    await expect(service.adjust(owner.id,{kind:'ADMIN_DEBIT',amountMinor:300,reason:'Debit correction'},'debit-key',admin.id,'req')).rejects.toMatchObject({status:422});
    await reservations.release(owner.id,session.id,'release-key',owner.id);
    await reservations.release(owner.id,session.id,'release-key',owner.id);
    const wallet=await service.wallet(owner.id);expect(wallet.availableMinor).toBe(1000n);
    const ledger=await ctx.db.walletLedger.findMany({where:{walletId:wallet.id}});
    expect(ledger.filter(e=>e.kind==='RESERVATION_RELEASE')).toHaveLength(1);
    expect(ledger.filter(e=>!['RESERVATION','RESERVATION_RELEASE'].includes(e.kind)).reduce((sum,e)=>sum+e.amountMinor,0n)).toBe(wallet.balanceMinor);
  });
  it('protects financial HTTP routes with RBAC and filters Sandbox records',async()=>{
    const {owner,admin}=await setup();const env=envSchema.parse({DATABASE_URL:url,CORS_ORIGINS:'https://app.example',FIREBASE_PROJECT_ID:'test',LOG_LEVEL:'silent'});
    const app=createApp(env);mountApi(app,ctx.db,async token=>({uid:token}) as DecodedIdToken);finishApp(app);
    const path=`/api/v1/admin/users/${owner.id}/wallet/adjustments`;
    expect((await request(app).post(path).auth(owner.firebaseUid,{type:'bearer'}).send({})).status).toBe(403);
    expect((await request(app).post(path).auth(admin.firebaseUid,{type:'bearer'}).send({kind:'ADMIN_CREDIT',amountMinor:1000,reason:'Test credit'})).status).toBe(400);
    const res=await request(app).post(path).auth(admin.firebaseUid,{type:'bearer'}).set('Idempotency-Key','http-test-key').send({kind:'ADMIN_CREDIT',amountMinor:1000,reason:'Test credit'});expect(res.status).toBe(201);
    const ledger=await request(app).get(`/api/v1/admin/wallet-ledger?userId=${owner.id}&environment=live`).auth(admin.firebaseUid,{type:'bearer'});expect(ledger.status).toBe(200);expect(ledger.body.data).toEqual([]);
    expect((await request(app).get(`/api/v1/admin/users/${owner.id}/wallet`).auth(admin.firebaseUid,{type:'bearer'})).body.data.balanceMinor).toBe('1000');
  });
});
