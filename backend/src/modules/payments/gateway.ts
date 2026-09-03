import { z } from 'zod';
import type { PaymentConfig } from '../../config/payments.js';
import { ApiError } from '../../shared/errors/api-error.js';
import type { GatewayOrder, PaymentGateway } from './contracts.js';
import { minorToBdt, safeGatewayUrl } from './validation.js';
const gatewayRecord = z.object({ status:z.string().max(30), tran_id:z.string().max(100), val_id:z.string().max(100).optional(), amount:z.string().max(30).optional(), currency:z.string().max(10).optional(), currency_type:z.string().max(10).optional(), currency_amount:z.string().max(30).optional(), risk_level:z.union([z.string().max(5),z.number().int()]).optional() });
export class SslcommerzGateway implements PaymentGateway {
  constructor(private config: PaymentConfig, private fetcher: typeof fetch = fetch) {}
  private async call(path: string, fields: Record<string,string>, method: 'GET' | 'POST') {
    const params = new URLSearchParams({ ...fields, store_id:this.config.SSLCOMMERZ_STORE_ID, store_passwd:this.config.SSLCOMMERZ_STORE_PASSWORD });
    const url = new URL(path,'https://sandbox.sslcommerz.com');
    if(method==='GET') url.search=params.toString();
    try {
      const response=await this.fetcher(url, { method, redirect:'error', signal:AbortSignal.timeout(this.config.PAYMENT_GATEWAY_TIMEOUT_MS), ...(method==='POST' ? {headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params.toString()} : {}) });
      if(!response.ok) throw new Error('Gateway HTTP failure');
      // Bound body memory as well as request time; never log URL/query/body or raw provider errors.
      const reader=response.body?.getReader(); if(!reader) throw new Error('Empty response');
      const chunks: Uint8Array[]=[]; let size=0;
      while(true) { const part=await reader.read(); if(part.done) break; size+=part.value.byteLength; if(size>65536) { await reader.cancel(); throw new Error('Oversized response'); } chunks.push(part.value); }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch { throw new ApiError(503,'GATEWAY_UNAVAILABLE','Payment gateway is unavailable; no Credits have been added'); }
  }
  async initiate(order: GatewayOrder) {
    const customer=z.object({name:z.string().min(1).max(50),email:z.email().max(50),phone:z.string().min(5).max(20),city:z.string().min(1).max(50)}).safeParse(order.user);
    if(!customer.success) throw new ApiError(422,'PAYMENT_PROFILE_REQUIRED','Set your name, verified email, phone and city before topping up');
    const callback=(route:string)=>new URL(`/api/v1/payments/sslcommerz/${route}`,this.config.API_PUBLIC_URL).href;
    const data=await this.call('/gwprocess/v4/api.php',{
      tran_id:order.transactionId,total_amount:minorToBdt(order.amountMinor),currency:'BDT',
      success_url:callback('success'),fail_url:callback('fail'),cancel_url:callback('cancel'),ipn_url:callback('ipn'),
      product_name:'HelioBay Credit Top-up',product_category:'topup',product_profile:'non-physical-goods',shipping_method:'NO',num_of_item:'1',emi_option:'0',
      cus_name:customer.data.name,cus_email:customer.data.email,cus_phone:customer.data.phone,cus_city:customer.data.city,cus_add1:customer.data.city,cus_country:'Bangladesh',
    },'POST');
    const parsed=z.object({status:z.literal('SUCCESS'),sessionkey:z.string().min(1).max(200),GatewayPageURL:safeGatewayUrl}).safeParse(data);
    if(!parsed.success) throw new ApiError(502,'GATEWAY_REJECTED','Payment gateway did not create a valid checkout');
    return {sessionKey:parsed.data.sessionkey,gatewayPageUrl:parsed.data.GatewayPageURL};
  }
  async validate(valId: string) {
    const parsed=gatewayRecord.safeParse(await this.call('/validator/api/validationserverAPI.php',{val_id:valId,format:'json'},'GET'));
    if(!parsed.success) throw new ApiError(503,'GATEWAY_INVALID_RESPONSE','Unable to validate payment');
    return parsed.data;
  }
  async lookup(transactionId: string) {
    const parsed=z.object({APIConnect:z.literal('DONE'),element:z.array(gatewayRecord).max(50).optional()}).safeParse(await this.call('/validator/api/merchantTransIDvalidationAPI.php',{tran_id:transactionId,format:'json'},'GET'));
    if(!parsed.success) throw new ApiError(503,'GATEWAY_INVALID_RESPONSE','Unable to reconcile payment');
    return parsed.data.element ?? [];
  }
}
