import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { isolatedDatabase } from './helpers/database.js';
import { PaymentService } from '../src/modules/payments/service.js';
import { paymentConfigSchema } from '../src/config/payments.js';
import { creditsToMinor, bdtToMinor, topupInput, safeGatewayUrl } from '../src/modules/payments/validation.js';
export const testPaymentConfig=paymentConfigSchema.parse({SSLCOMMERZ_STORE_ID:'test-store',SSLCOMMERZ_STORE_PASSWORD:'test-password',PUBLIC_APP_URL:'https://app.example',API_PUBLIC_URL:'https://api.example'});
it('converts Credits and decimal BDT exactly',()=>{ expect(creditsToMinor(500)).toBe(50000n); expect(bdtToMinor('10.01')).toBe(1001n); });
it.each([0,9,-10,10.1,NaN,Infinity,500001,'500'])('rejects invalid Credits %s',credits=>{ expect(topupInput.safeParse({credits}).success).toBe(false); });
it('allows the minimum ten Credits',()=>{ expect(creditsToMinor(10)).toBe(1000n); });
it.each(['https://evil.example','http://sandbox.sslcommerz.com','https://sandbox.sslcommerz.com.evil.example','https://u:p@sandbox.sslcommerz.com'])('rejects unsafe checkout URL %s',url=>{expect(safeGatewayUrl.safeParse(url).success).toBe(false);});
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('top-up initiation',()=>{
  let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
  beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>{await ctx?.close();});
  it('creates one pending transaction without crediting and reuses its checkout',async()=>{
    const user=await ctx.db.user.create({data:{firebaseUid:crypto.randomUUID(),name:'Customer',wallet:{create:{}}}});
    const gateway={initiate:vi.fn().mockResolvedValue({sessionKey:'private-session',gatewayPageUrl:'https://sandbox.sslcommerz.com/pay'}),validate:vi.fn(),lookup:vi.fn()};
    const service=new PaymentService(ctx.db,gateway,testPaymentConfig);
    const first=await service.initiate(user,{credits:500},'initiation-key');
    const second=await service.initiate(user,{credits:500},'initiation-key');
    expect(second.transactionId).toBe(first.transactionId); expect(first.status).toBe('PENDING'); expect(first).not.toHaveProperty('gatewaySessionKey');expect(gateway.initiate).toHaveBeenCalledTimes(1);
    expect((await ctx.db.wallet.findUniqueOrThrow({where:{userId:user.id}})).balanceMinor).toBe(0n);expect(await ctx.db.walletLedger.count()).toBe(0);
    await expect(service.initiate(user,{credits:100},'initiation-key')).rejects.toMatchObject({status:409});
    await expect(service.get('another-owner',first.transactionId)).rejects.toThrow();
  });
});
