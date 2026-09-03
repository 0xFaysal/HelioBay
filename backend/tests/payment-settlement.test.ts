import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import request from 'supertest';
import { isolatedDatabase } from './helpers/database.js';
import { PaymentService } from '../src/modules/payments/service.js';
import { PaymentSettlement } from '../src/modules/payments/settlement.js';
import { paymentConfigSchema } from '../src/config/payments.js';
import { createApp,finishApp } from '../src/app.js';
import { envSchema } from '../src/config/env.js';
import { callbackRoutes } from '../src/modules/payments/callback-controller.js';
import { AdminWalletService } from '../src/modules/admin/wallet-service.js';
import { ApiError } from '../src/shared/errors/api-error.js';
const url=process.env.TEST_DATABASE_URL;
const config=paymentConfigSchema.parse({SSLCOMMERZ_STORE_ID:'test-store',SSLCOMMERZ_STORE_PASSWORD:'test-password',PUBLIC_APP_URL:'https://app.example',API_PUBLIC_URL:'https://api.example'});
describe.skipIf(!url)('validated payment settlement',()=>{
  let ctx:Awaited<ReturnType<typeof isolatedDatabase>>;
  beforeAll(async()=>{ctx=await isolatedDatabase(url!);},30000);afterAll(async()=>{await ctx?.close();});
  async function setup() {
    const user=await ctx.db.user.create({data:{firebaseUid:crypto.randomUUID(),name:'Payment owner',wallet:{create:{}}}});
    const payment=await ctx.db.paymentTransaction.create({data:{userId:user.id,amountMinor:1000n,idempotencyKey:crypto.randomUUID(),expiresAt:new Date(Date.now()+60000)}});
    const validation={status:'VALID',tran_id:payment.id,val_id:`val-${payment.id}`,amount:'10.00',currency:'BDT',currency_type:'BDT',currency_amount:'10.00',risk_level:'0'};
    const gateway={initiate:vi.fn(),validate:vi.fn().mockResolvedValue(validation),lookup:vi.fn().mockResolvedValue([validation])};
    const service=new PaymentService(ctx.db,gateway,config),settlement=new PaymentSettlement(service);
    const env=envSchema.parse({DATABASE_URL:url,CORS_ORIGINS:'https://app.example',FIREBASE_PROJECT_ID:'test',LOG_LEVEL:'silent'});
    const app=createApp(env); app.use('/api/v1/payments/sslcommerz',callbackRoutes(service));finishApp(app);
    return {user,payment,validation,gateway,service,settlement,app};
  }
  it('credits exactly once when success and IPN arrive concurrently and repeatedly',async()=>{
    const {user,payment,validation,app}=await setup();
    const body={tran_id:payment.id,val_id:validation.val_id,value_a:'attacker',amount:'999999.99'};
    const responses=await Promise.all(['success','ipn','ipn','success'].map(route=>request(app).post(`/api/v1/payments/sslcommerz/${route}`).set('Origin','https://sandbox.sslcommerz.com').type('form').send(body)));
    expect(responses.map(r=>r.status).sort()).toEqual([200,200,303,303]);
    const wallet=await ctx.db.wallet.findUniqueOrThrow({where:{userId:user.id}});expect(wallet.balanceMinor).toBe(1000n);
    expect(await ctx.db.walletLedger.count({where:{paymentId:payment.id,kind:'TOP_UP'}})).toBe(1);
    expect(responses[0]!.headers.location).toBe(`https://app.example/payment/success?paymentId=${payment.id}`);
  });
  it.each([{amount:'11.00'},{currency:'USD'},{currency_type:'USD'},{currency_amount:'11.00'},{tran_id:'someone-else'},{val_id:'another-validation'}])('rejects validation mismatch %j',async mismatch=>{
    const {payment,validation,gateway,settlement}=await setup();gateway.validate.mockResolvedValue({...validation,...mismatch});
    await expect(settlement.validate(payment.id,validation.val_id)).rejects.toMatchObject({status:422});
    expect(await ctx.db.walletLedger.count({where:{paymentId:payment.id}})).toBe(0);
  });
  it('rejects unknown transactions without calling the gateway',async()=>{const {gateway,settlement}=await setup();await expect(settlement.validate('unknown','val')).rejects.toThrow();expect(gateway.validate).not.toHaveBeenCalled();});
  it.each(['1',undefined])('holds risky or missing risk status %s without credit',async risk_level=>{
    const {payment,validation,gateway,settlement}=await setup();gateway.validate.mockResolvedValue({...validation,risk_level});
    expect((await settlement.validate(payment.id,validation.val_id)).status).toBe('RISK_REVIEW');
    gateway.validate.mockResolvedValue(validation);expect((await settlement.validate(payment.id,validation.val_id)).status).toBe('RISK_REVIEW');
    expect(await ctx.db.walletLedger.count({where:{paymentId:payment.id}})).toBe(0);
  });
  it('keeps validation timeout retryable without crediting',async()=>{
    const {payment,validation,gateway,settlement}=await setup();gateway.validate.mockRejectedValue(new ApiError(503,'GATEWAY_UNAVAILABLE','timeout'));
    await expect(settlement.validate(payment.id,validation.val_id)).rejects.toMatchObject({status:503});
    expect((await ctx.db.paymentTransaction.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('VALIDATING');
    expect(await ctx.db.walletLedger.count({where:{paymentId:payment.id}})).toBe(0);
    gateway.validate.mockResolvedValue(validation);expect((await settlement.reconcile(payment.id)).status).toBe('PAID');
  });
  it.each(['FAILED','CANCELLED'])('uses authoritative %s status and accepts a later validated success',async status=>{
    const {payment,validation,gateway,settlement}=await setup();gateway.lookup.mockResolvedValue([{...validation,status}]);
    expect((await settlement.reconcile(payment.id)).status).toBe(status);expect(await ctx.db.walletLedger.count({where:{paymentId:payment.id}})).toBe(0);
    expect((await settlement.validate(payment.id,validation.val_id)).status).toBe('PAID');
    expect((await settlement.reconcile(payment.id)).status).toBe('PAID');
  });
  it('ignores forged cancellation and expires pending checkout without credit',async()=>{
    const {payment,gateway,service,app}=await setup();gateway.lookup.mockResolvedValue([]);
    const res=await request(app).post('/api/v1/payments/sslcommerz/cancel').type('form').send({tran_id:payment.id,status:'CANCELLED'});expect(res.status).toBe(303);
    expect((await ctx.db.paymentTransaction.findUniqueOrThrow({where:{id:payment.id}})).status).toBe('PENDING');
    await ctx.db.paymentTransaction.update({where:{id:payment.id},data:{expiresAt:new Date(0)}});
    expect((await service.get(payment.userId,payment.id)).status).toBe('EXPIRED');
  });

  it('reverses a paid wallet top-up without letting later callbacks credit it again',async()=>{
    const {user,payment,validation,settlement}=await setup();await settlement.validate(payment.id,validation.val_id);
    const admin=await ctx.db.user.create({data:{firebaseUid:crypto.randomUUID(),name:'Admin',role:'ADMIN'}});
    const entry=await ctx.db.walletLedger.findFirstOrThrow({where:{paymentId:payment.id,kind:'TOP_UP'}});
    await new AdminWalletService(ctx.db).adjust(user.id,{kind:'REVERSAL',ledgerId:entry.id,reason:'Reverse test top-up'},'reverse-payment',admin.id,'req');
    expect((await settlement.validate(payment.id,validation.val_id)).status).toBe('REVERSED');
    expect((await ctx.db.wallet.findUniqueOrThrow({where:{userId:user.id}})).balanceMinor).toBe(0n);
    expect(await ctx.db.walletLedger.count({where:{paymentId:payment.id,kind:'TOP_UP'}})).toBe(1);
  });
  it('validates callback fields and body size',async()=>{const {app}=await setup();expect((await request(app).post('/api/v1/payments/sslcommerz/ipn').type('form').send({tran_id:['one','two']})).status).toBe(400);expect((await request(app).post('/api/v1/payments/sslcommerz/ipn').type('form').send({tran_id:'x'.repeat(9000)})).status).toBe(413);});
});
