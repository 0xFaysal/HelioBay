import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isolatedDatabase } from './helpers/database.js';
import { postLedger } from '../src/modules/wallets/ledger.js';
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('transactional credit ledger', () => {
  let ctx: Awaited<ReturnType<typeof isolatedDatabase>>;
  beforeAll(async () => { ctx = await isolatedDatabase(url!); }, 30000);
  afterAll(async () => { await ctx?.close(); });
  async function owner() { return ctx.db.user.create({data:{firebaseUid:crypto.randomUUID(),name:'Wallet owner',wallet:{create:{}}}}); }
  it('serializes concurrent credits and returns the original result for retries', async () => {
    const u=await owner();
    const input={userId:u.id,actorId:u.id,kind:'ADMIN_CREDIT' as const,amountMinor:1000n,key:'credit-key',description:'Test credit',hash:'same'};
    const entries=await Promise.all(Array.from({length:4},()=>ctx.db.$transaction(tx=>postLedger(tx,input))));
    expect(new Set(entries.map(e=>e.id)).size).toBe(1);
    expect((await ctx.db.wallet.findUniqueOrThrow({where:{userId:u.id}})).balanceMinor).toBe(1000n);
    await expect(ctx.db.$transaction(tx=>postLedger(tx,{...input,amountMinor:2000n,hash:'different'}))).rejects.toMatchObject({status:409});
  });
  it('prevents two concurrent debits from overspending', async () => {
    const u=await owner(); const base={userId:u.id,actorId:u.id,description:'Test entry',hash:'test'};
    await ctx.db.$transaction(tx=>postLedger(tx,{...base,kind:'ADMIN_CREDIT',amountMinor:1000n,key:'credit'}));
    const results=await Promise.allSettled([1,2].map(i=>ctx.db.$transaction(tx=>postLedger(tx,{...base,kind:'ADMIN_DEBIT',amountMinor:-800n,key:`debit-${i}`}))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect((await ctx.db.wallet.findUniqueOrThrow({where:{userId:u.id}})).balanceMinor).toBe(200n);
  });
  it('rejects direct balance edits and keeps ledger immutable', async () => {
    const u=await owner();
    await expect(ctx.db.wallet.update({where:{userId:u.id},data:{balanceMinor:5000n}})).rejects.toThrow();
    const row=await ctx.db.$transaction(tx=>postLedger(tx,{userId:u.id,actorId:u.id,kind:'ADMIN_CREDIT',amountMinor:1000n,key:'immutable',description:'Test credit',hash:'same'}));
    await expect(ctx.db.walletLedger.delete({where:{id:row.id}})).rejects.toThrow();
    await expect(ctx.db.walletLedger.update({where:{id:row.id},data:{amountMinor:2000n}})).rejects.toThrow();
  });
  it('rolls back posted funds when the enclosing operation fails', async () => {
    const u=await owner();
    await expect(ctx.db.$transaction(async tx=>{ await postLedger(tx,{userId:u.id,actorId:u.id,kind:'ADMIN_CREDIT',amountMinor:1000n,key:'rollback',description:'Test credit',hash:'same'}); throw new Error('abort'); })).rejects.toThrow('abort');
    expect((await ctx.db.wallet.findUniqueOrThrow({where:{userId:u.id}})).balanceMinor).toBe(0n);
    expect(await ctx.db.walletLedger.count({where:{wallet:{userId:u.id}}})).toBe(0);
  });
});
