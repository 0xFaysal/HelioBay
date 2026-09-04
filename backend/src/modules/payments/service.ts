import { randomBytes } from 'node:crypto';
import type { Database } from '../../shared/database/client.js';
import type { PaymentTransaction, User } from '../../generated/prisma/client.js';
import type { PaymentConfig } from '../../config/payments.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { fingerprint, lockWallet, postLedger } from '../wallets/ledger.js';
import type { PaymentGateway } from './contracts.js';
import { creditsToMinor, topupInput, safeGatewayUrl } from './validation.js';
export function safePayment(payment: PaymentTransaction) {
  return { transactionId:payment.id,status:payment.status==='VERIFIED'?'PAID':payment.status,expiresAt:payment.expiresAt,
    GatewayPageURL:payment.status==='PENDING' && payment.expiresAt>new Date() ? payment.gatewayPageUrl : null,
    amountMinor:payment.amountMinor,currency:payment.currency,provider:payment.provider,isSandbox:payment.isSandbox,userId:payment.userId,createdAt:payment.createdAt,verifiedAt:payment.verifiedAt,providerReference:payment.providerReference };
}
export class PaymentService {
  constructor(readonly db: Database, readonly gateway: PaymentGateway | null, readonly config: PaymentConfig | null) {}
  requireGateway() { if(!this.gateway || !this.config) throw new ApiError(503,'PAYMENTS_NOT_CONFIGURED','Sandbox payments are not configured'); return this.gateway; }
  async initiate(user: User, input: unknown, key: string) {
    const local=this.config?.PAYMENT_PROVIDER==='local-sandbox';
    const gateway=local?null:this.requireGateway();
    const {credits}=topupInput.parse(input);
    if(credits>this.config!.MAX_TOPUP_CREDITS) throw new ApiError(422,'TOPUP_LIMIT','Requested Credits exceed the configured top-up limit');
    const amountMinor=creditsToMinor(credits);
    const hash=fingerprint({userId:user.id,amountMinor,currency:'BDT',isSandbox:true});
    const result=await this.db.$transaction(async tx=>{
      await lockWallet(tx,user.id);
      const existing=await tx.paymentTransaction.findUnique({where:{userId_idempotencyKey:{userId:user.id,idempotencyKey:key}}});
      if(existing) { if(existing.requestHash!==hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was used for a different top-up'); return {payment:existing,created:false}; }
      const payment=await tx.paymentTransaction.create({data:{id:`HB${randomBytes(12).toString('hex')}`,userId:user.id,amountMinor,provider:local?'LOCAL_SANDBOX':'SSLCOMMERZ',idempotencyKey:key,requestHash:hash,isSandbox:true,expiresAt:new Date(Date.now()+this.config!.PAYMENT_TTL_MINUTES*60000)}});
      return {payment,created:true};
    });
    if(!result.created) return safePayment(await this.expire(result.payment));
    if(local){const payment=await this.db.paymentTransaction.update({where:{id:result.payment.id},data:{gatewayPageUrl:`/wallet/sandbox/${result.payment.id}`,gatewaySessionKey:`local:${result.payment.id}`}});return safePayment(payment);}
    try {
      const checkout=await gateway!.initiate({transactionId:result.payment.id,amountMinor,user});
      const gatewayPageUrl=safeGatewayUrl.parse(checkout.gatewayPageUrl);
      const payment=await this.db.paymentTransaction.update({where:{id:result.payment.id},data:{gatewaySessionKey:checkout.sessionKey,gatewayPageUrl,lastErrorCode:null}});
      return safePayment(payment);
    } catch(error) {
      await this.db.paymentTransaction.updateMany({where:{id:result.payment.id,status:'PENDING'},data:{lastErrorCode:'INITIATION_UNCONFIRMED'}});
      throw error;
    }
  }
  async expire(payment: PaymentTransaction) {
    if(payment.expiresAt<=new Date() && ['PENDING','VALIDATING'].includes(payment.status)) {
      await this.db.paymentTransaction.updateMany({where:{id:payment.id,status:{in:['PENDING','VALIDATING']}},data:{status:'EXPIRED'}});
      return this.db.paymentTransaction.findUniqueOrThrow({where:{id:payment.id}});
    }
    return payment;
  }
  async get(userId:string,id:string) { return safePayment(await this.expire(await this.db.paymentTransaction.findFirstOrThrow({where:{id,userId}}))); }
  async completeLocal(userId:string,id:string,outcome:'success'|'failure'|'cancel') {
    if(this.config?.PAYMENT_PROVIDER!=='local-sandbox')throw new ApiError(404,'LOCAL_SANDBOX_DISABLED','Local sandbox payment is disabled');
    return this.db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "PaymentTransaction" WHERE id=${id} FOR UPDATE`;
      const payment=await tx.paymentTransaction.findFirstOrThrow({where:{id,userId}});
      if(payment.provider!=='LOCAL_SANDBOX')throw new ApiError(409,'PAYMENT_PROVIDER_MISMATCH','Payment does not belong to the local sandbox');
      if(payment.status==='PAID'||payment.status==='VERIFIED')return safePayment(payment);
      if(!['PENDING','FAILED','CANCELLED'].includes(payment.status))throw new ApiError(409,'PAYMENT_NOT_PENDING','Payment cannot be completed from its current state');
      if(outcome!=='success')return safePayment(await tx.paymentTransaction.update({where:{id},data:{status:outcome==='cancel'?'CANCELLED':'FAILED',lastCheckedAt:new Date(),gatewayStatus:outcome.toUpperCase()}}));
      const updated=await tx.paymentTransaction.update({where:{id},data:{status:'PAID',verifiedAt:new Date(),lastCheckedAt:new Date(),providerReference:`LOCAL-${id}`,gatewayStatus:'SUCCESS',lastErrorCode:null}});
      await postLedger(tx,{userId,actorId:userId,kind:'TOP_UP',amountMinor:payment.amountMinor,key:`local-topup:${id}`,hash:fingerprint({paymentId:id,amountMinor:payment.amountMinor}),description:'HelioBay LOCAL SANDBOX Credit top-up',paymentId:id,isSandbox:true,metadata:{provider:'LOCAL_SANDBOX',environment:'local'}});
      await tx.notification.upsert({where:{userId_type_reference:{userId,type:'PAYMENT_VERIFIED',reference:id}},create:{userId,type:'PAYMENT_VERIFIED',title:'Credits added',message:`LOCAL SANDBOX top-up: ${payment.amountMinor.toString()} poisha.`,reference:id},update:{}});
      return safePayment(updated);
    });
  }
}
