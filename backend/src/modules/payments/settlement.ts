import { ApiError } from '../../shared/errors/api-error.js';
import { fingerprint, postLedger } from '../wallets/ledger.js';
import type { GatewayValidation } from './contracts.js';
import { PaymentService, safePayment } from './service.js';
import { bdtToMinor } from './validation.js';
const credited = ['PAID','VERIFIED','REVERSED'];
const valid = (status: string) => ['VALID','VALIDATED'].includes(status);
export class PaymentSettlement {
  constructor(private service: PaymentService) {}
  private verifyIdentity(result: GatewayValidation, transactionId: string, amountMinor: bigint, valId?: string) {
    if(result.tran_id!==transactionId || (valId && result.val_id!==valId)) throw new ApiError(422,'PAYMENT_ID_MISMATCH','Gateway transaction identity does not match');
    if(result.currency!=='BDT' || result.currency_type!=='BDT') throw new ApiError(422,'PAYMENT_CURRENCY_MISMATCH','Gateway currency does not match');
    if(!result.amount || !result.currency_amount || bdtToMinor(result.amount)!==amountMinor || bdtToMinor(result.currency_amount)!==amountMinor) throw new ApiError(422,'PAYMENT_AMOUNT_MISMATCH','Gateway amount does not match');
  }
  async validate(transactionId:string,valId:string) {
    const gateway=this.service.requireGateway(), db=this.service.db;
    const payment=await db.paymentTransaction.findUniqueOrThrow({where:{id:transactionId}});
    if(credited.includes(payment.status) || payment.status==='RISK_REVIEW') return safePayment(payment);
    if(!payment.isSandbox) throw new ApiError(422,'PAYMENT_ENVIRONMENT_MISMATCH','Only Sandbox payments can be validated here');
    await db.paymentTransaction.updateMany({where:{id:transactionId,status:{in:['PENDING','FAILED','CANCELLED','EXPIRED']}},data:{status:'VALIDATING'}});
    let result:GatewayValidation;
    try {
      result=await gateway.validate(valId);
      this.verifyIdentity(result,transactionId,payment.amountMinor,valId);
      if(!valid(result.status)) throw new ApiError(422,'PAYMENT_NOT_VALID','Gateway has not confirmed a successful payment');
    } catch(error) {
      await db.paymentTransaction.updateMany({where:{id:transactionId,status:'VALIDATING'},data:{lastCheckedAt:new Date(),lastErrorCode:error instanceof ApiError ? error.code : 'VALIDATION_UNAVAILABLE'}});
      if(error instanceof ApiError) throw error;
      throw new ApiError(503,'GATEWAY_UNAVAILABLE','Payment validation is unavailable; no Credits have been added');
    }
    return db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM "PaymentTransaction" WHERE id = ${transactionId} FOR UPDATE`;
      const current=await tx.paymentTransaction.findUniqueOrThrow({where:{id:transactionId}});
      if(credited.includes(current.status) || current.status==='RISK_REVIEW') return safePayment(current);
      const safeRisk=result.risk_level===0 || result.risk_level==='0';
      const updated=await tx.paymentTransaction.update({where:{id:transactionId},data:{status:safeRisk?'PAID':'RISK_REVIEW',providerReference:valId,verifiedAt:safeRisk?new Date():null,lastCheckedAt:new Date(),lastErrorCode:null,riskLevel:safeRisk?0:1,gatewayStatus:result.status}});
      if(safeRisk) await postLedger(tx,{userId:current.userId,actorId:current.userId,kind:'TOP_UP',amountMinor:current.amountMinor,key:`topup:${current.id}`,hash:fingerprint({paymentId:current.id,amountMinor:current.amountMinor}),description:'SSLCOMMERZ Sandbox Credit top-up',paymentId:current.id,isSandbox:true,metadata:{provider:'SSLCOMMERZ',environment:'sandbox'}});
      return safePayment(updated);
    });
  }
  async reconcile(transactionId:string) {
    const gateway=this.service.requireGateway(),db=this.service.db;
    const payment=await db.paymentTransaction.findUniqueOrThrow({where:{id:transactionId}});
    if(credited.includes(payment.status) || payment.status==='RISK_REVIEW') return safePayment(payment);
    if(!payment.isSandbox) throw new ApiError(422,'PAYMENT_ENVIRONMENT_MISMATCH','Only Sandbox payments can be reconciled here');
    let records:GatewayValidation[];
    try { records=await gateway.lookup(transactionId); }
    catch(error) { await db.paymentTransaction.updateMany({where:{id:transactionId,status:{in:['PENDING','VALIDATING','EXPIRED','FAILED','CANCELLED']}},data:{lastErrorCode:'RECONCILIATION_UNAVAILABLE',lastCheckedAt:new Date()}}); if(error instanceof ApiError) throw error; throw new ApiError(503,'GATEWAY_UNAVAILABLE','Payment reconciliation is unavailable'); }
    // A failed browser return cannot override an authoritative paid attempt.
    const successful=records.filter(r=>r.tran_id===transactionId && valid(r.status));
    const record=successful.find(r=>r.risk_level!==0 && r.risk_level!=='0') ?? successful[0];
    if(record) {
      if(!record.val_id) throw new ApiError(503,'GATEWAY_INVALID_RESPONSE','Gateway omitted validation identity');
      return this.validate(transactionId,record.val_id);
    }
    const failure=records.find(r=>r.tran_id===transactionId && ['FAILED','CANCELLED','CANCEL'].includes(r.status));
    if(failure && !records.some(r=>r.tran_id===transactionId && r.status==='PENDING')) {
      this.verifyIdentity(failure,transactionId,payment.amountMinor);
      await db.paymentTransaction.updateMany({where:{id:transactionId,status:{in:['PENDING','VALIDATING','FAILED','CANCELLED','EXPIRED']}},data:{status:failure.status==='FAILED'?'FAILED':'CANCELLED',lastCheckedAt:new Date(),lastErrorCode:null,gatewayStatus:failure.status}});
    } else await db.paymentTransaction.updateMany({where:{id:transactionId,status:{in:['PENDING','VALIDATING','FAILED','CANCELLED','EXPIRED']}},data:{lastCheckedAt:new Date()}});
    return safePayment(await this.service.expire(await db.paymentTransaction.findUniqueOrThrow({where:{id:transactionId}})));
  }
  async reconcileBatch(limit=50) {
    const candidates=await this.service.db.paymentTransaction.findMany({where:{isSandbox:true,status:{in:['PENDING','VALIDATING','EXPIRED','FAILED','CANCELLED']},createdAt:{gte:new Date(Date.now()-7*86400000)},OR:[{lastCheckedAt:null},{lastCheckedAt:{lt:new Date(Date.now()-60000)}}]},take:Math.min(100,Math.max(1,limit)),orderBy:{createdAt:'asc'},select:{id:true}});
    const results:{transactionId:string;status:string}[]=[];
    for(const candidate of candidates) {
      try { const result=await this.reconcile(candidate.id);results.push({transactionId:candidate.id,status:result.status}); }
      catch { results.push({transactionId:candidate.id,status:'RETRY_REQUIRED'}); }
    }
    return results;
  }
}
