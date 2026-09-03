import { randomBytes } from 'node:crypto';
import type { Database } from '../../shared/database/client.js';
import type { PaymentTransaction, User } from '../../generated/prisma/client.js';
import type { PaymentConfig } from '../../config/payments.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { fingerprint, lockWallet } from '../wallets/ledger.js';
import type { PaymentGateway } from './contracts.js';
import { creditsToMinor, topupInput, safeGatewayUrl } from './validation.js';
export function safePayment(payment: PaymentTransaction) {
  return { transactionId:payment.id,status:payment.status==='VERIFIED'?'PAID':payment.status,expiresAt:payment.expiresAt,
    GatewayPageURL:payment.status==='PENDING' && payment.expiresAt>new Date() ? payment.gatewayPageUrl : null,
    amountMinor:payment.amountMinor,currency:payment.currency,isSandbox:payment.isSandbox,userId:payment.userId,createdAt:payment.createdAt,verifiedAt:payment.verifiedAt,providerReference:payment.providerReference };
}
export class PaymentService {
  constructor(readonly db: Database, readonly gateway: PaymentGateway | null, readonly config: PaymentConfig | null) {}
  requireGateway() { if(!this.gateway || !this.config) throw new ApiError(503,'PAYMENTS_NOT_CONFIGURED','Sandbox payments are not configured'); return this.gateway; }
  async initiate(user: User, input: unknown, key: string) {
    const gateway=this.requireGateway();
    const {credits}=topupInput.parse(input);
    if(credits>this.config!.MAX_TOPUP_CREDITS) throw new ApiError(422,'TOPUP_LIMIT','Requested Credits exceed the configured top-up limit');
    const amountMinor=creditsToMinor(credits);
    const hash=fingerprint({userId:user.id,amountMinor,currency:'BDT',isSandbox:true});
    const result=await this.db.$transaction(async tx=>{
      await lockWallet(tx,user.id);
      const existing=await tx.paymentTransaction.findUnique({where:{userId_idempotencyKey:{userId:user.id,idempotencyKey:key}}});
      if(existing) { if(existing.requestHash!==hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was used for a different top-up'); return {payment:existing,created:false}; }
      const payment=await tx.paymentTransaction.create({data:{id:`HB${randomBytes(12).toString('hex')}`,userId:user.id,amountMinor,idempotencyKey:key,requestHash:hash,isSandbox:true,expiresAt:new Date(Date.now()+this.config!.PAYMENT_TTL_MINUTES*60000)}});
      return {payment,created:true};
    });
    if(!result.created) return safePayment(await this.expire(result.payment));
    try {
      const checkout=await gateway.initiate({transactionId:result.payment.id,amountMinor,user});
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
}
