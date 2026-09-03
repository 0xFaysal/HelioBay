import { describe,expect,it,vi } from 'vitest';
import { SslcommerzGateway } from '../src/modules/payments/gateway.js';
import { paymentConfigSchema } from '../src/config/payments.js';
import type { User } from '../src/generated/prisma/client.js';
const config=paymentConfigSchema.parse({SSLCOMMERZ_STORE_ID:'test-store',SSLCOMMERZ_STORE_PASSWORD:'do-not-expose',PUBLIC_APP_URL:'https://app.example',API_PUBLIC_URL:'https://api.example',PAYMENT_GATEWAY_TIMEOUT_MS:100});
const user={name:'Test Customer',email:'customer@example.com',phone:'01700000000',city:'Dhaka'} as User;
describe('SSLCOMMERZ HTTP boundary (no live network)',()=>{
  it('sends the official form fields and exact BDT amount for hosted checkout',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({status:'SUCCESS',sessionkey:'private-session',GatewayPageURL:'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?SESSIONKEY=abc'})));
    const result=await new SslcommerzGateway(config,fetcher).initiate({transactionId:'HB123',amountMinor:50000n,user});
    const [url,options]=fetcher.mock.calls[0]!;
    expect(String(url)).toBe('https://sandbox.sslcommerz.com/gwprocess/v4/api.php');expect(options!.method).toBe('POST');expect(options!.redirect).toBe('error');
    const form=new URLSearchParams(options!.body as string);
    expect(Object.fromEntries(form)).toMatchObject({store_id:'test-store',store_passwd:'do-not-expose',tran_id:'HB123',total_amount:'500.00',currency:'BDT',product_name:'HelioBay Credit Top-up',product_category:'topup',product_profile:'non-physical-goods',shipping_method:'NO',cus_email:user.email,ipn_url:'https://api.example/api/v1/payments/sslcommerz/ipn'});
    expect(result.sessionKey).toBe('private-session');
  });
  it('validates by val_id through the configured sandbox store',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({status:'VALID',tran_id:'HB123',val_id:'val1',amount:'10.00',currency:'BDT',currency_type:'BDT',currency_amount:'10.00',risk_level:'0',card_no:'do-not-persist'})));
    const result=await new SslcommerzGateway(config,fetcher).validate('val1');
    const url=new URL(String(fetcher.mock.calls[0]![0]));expect(url.pathname).toBe('/validator/api/validationserverAPI.php');expect(url.searchParams.get('val_id')).toBe('val1');expect(url.searchParams.get('store_id')).toBe('test-store');expect(result).not.toHaveProperty('card_no');
  });
  it('times out without leaking credentials or raw gateway errors',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation((_url,options)=>new Promise((_resolve,reject)=>{options!.signal!.addEventListener('abort',()=>reject(new Error('do-not-expose')));}));
    const promise=new SslcommerzGateway(config,fetcher).validate('val1');
    await expect(promise).rejects.toMatchObject({status:503,code:'GATEWAY_UNAVAILABLE'});
  });
  it('rejects a failed HTTP response safely',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('do-not-expose',{status:500}));
    await expect(new SslcommerzGateway(config,fetcher).lookup('HB123')).rejects.toMatchObject({status:503,message:expect.not.stringContaining('do-not-expose')});
  });
  it('rejects untrusted hosted redirects',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({status:'SUCCESS',sessionkey:'private',GatewayPageURL:'https://evil.example/collect'})));
    await expect(new SslcommerzGateway(config,fetcher).initiate({transactionId:'HB123',amountMinor:1000n,user})).rejects.toMatchObject({status:502});
  });
  it('requires actual customer profile fields before contacting the gateway',async()=>{
    const fetcher=vi.fn<typeof fetch>();await expect(new SslcommerzGateway(config,fetcher).initiate({transactionId:'HB123',amountMinor:1000n,user:{...user,email:null}})).rejects.toMatchObject({status:422});expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not allow live mode or credential-bearing public URLs',()=>{
    expect(paymentConfigSchema.safeParse({...config,SSLCOMMERZ_IS_LIVE:'true'}).success).toBe(false);
    expect(paymentConfigSchema.safeParse({...config,API_PUBLIC_URL:'https://user:secret@api.example'}).success).toBe(false);
  });
});
