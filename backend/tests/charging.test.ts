import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { isolatedDatabase } from './helpers/database.js';
import { chargingFixture,telemetry } from './helpers/charging.js';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('charging engine',()=>{
 let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
 beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>{await ctx?.close();});
 it('reserves once, acknowledges, stops and settles only confirmed metering once',async()=>{
  const f=await chargingFixture(ctx.db);const sessions=await Promise.all([f.start(),f.start()]),s=sessions[0]!;expect(sessions[1]!.id).toBe(s.id);expect(s.status).toBe('START_PENDING');expect(s.reservedMinor).toBe(1000n);expect(await ctx.db.creditReservation.count({where:{sessionId:s.id}})).toBe(1);
  await f.ack(s.id);expect((await ctx.db.chargingSession.findUniqueOrThrow({where:{id:s.id}})).status).toBe('CHARGING');
  await f.engine.stop(s.id,f.owner.id,'USER_STOPPED','stop-key','req');expect((await ctx.db.creditReservation.findUniqueOrThrow({where:{sessionId:s.id}})).status).toBe('HELD');
  const t={...telemetry(),bayId:f.bay.code,sessionId:s.id,energyMWh:'1000',final:true};await Promise.all([f.engine.telemetry(f.device.id,t),f.engine.telemetry(f.device.id,t)]);
  const result=await ctx.db.chargingSession.findUniqueOrThrow({where:{id:s.id}});expect(result.status).toBe('COMPLETED');expect(result.costMinor).toBe(1n);expect(result.endingBalanceMinor).toBe(999n);expect(await ctx.db.walletLedger.count({where:{sessionId:s.id,kind:'CHARGING_DEBIT'}})).toBe(1);expect((await ctx.db.creditReservation.findUniqueOrThrow({where:{sessionId:s.id}})).status).toBe('SETTLED');
 });
 it('releases only an explicitly rejected zero-energy start',async()=>{const f=await chargingFixture(ctx.db),s=await f.start();await f.ack(s.id,false);expect((await ctx.db.chargingSession.findUniqueOrThrow({where:{id:s.id}})).status).toBe('FAILED');expect((await ctx.db.creditReservation.findUniqueOrThrow({where:{sessionId:s.id}})).status).toBe('RELEASED');});
 it('holds credit for unknown command outcome',async()=>{const f=await chargingFixture(ctx.db),s=await f.start();await ctx.db.deviceCommand.updateMany({where:{sessionId:s.id},data:{expiresAt:new Date(0)}});await f.engine.sweep();expect((await ctx.db.chargingSession.findUniqueOrThrow({where:{id:s.id}})).reconciliationRequired).toBe(true);expect((await ctx.db.creditReservation.findUniqueOrThrow({where:{sessionId:s.id}})).status).toBe('HELD');});
 it.each(['plug','offline','credit','fault'] as const)('rejects unsafe start: %s',async(kind)=>{const f=await chargingFixture(ctx.db,kind==='credit'?0:1000);if(kind==='plug')await ctx.db.bay.update({where:{id:f.bay.id},data:{plugConnected:false}});if(kind==='offline')await ctx.db.device.update({where:{id:f.device.id},data:{status:'OFFLINE'}});if(kind==='fault')await ctx.db.fault.create({data:{deviceId:f.device.id,bayId:f.bay.id,code:'SENSOR',message:'Fault'}});await expect(f.start()).rejects.toMatchObject({status:422});expect(await ctx.db.creditReservation.count({where:{session:{ownerId:f.owner.id}}})).toBe(0);});
 it('rejects a conflicting user start and hierarchy mismatch',async()=>{const f=await chargingFixture(ctx.db);await f.start();await expect(f.engine.start(f.owner.id,f.input,'another-start','req')).rejects.toMatchObject({status:409});const other=await chargingFixture(ctx.db);await expect(other.engine.start(other.owner.id,{...other.input,bayId:f.bay.code},'wrong-bay','req')).rejects.toThrow();});
});
