import type { Database } from '../../shared/database/client.js';
import type { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
import { pageArgs } from '../../shared/validation/common.js';
import { postLedger,lockWallet,fingerprint } from '../wallets/ledger.js';
import { WalletService } from '../wallets/service.js';
import { safePayment } from '../payments/service.js';
import { adjustmentInput,financialFilters } from './wallet-validation.js';
export class AdminWalletService {
  constructor(private db:Database) {}
  wallet(userId:string) { return new WalletService(this.db).get(userId); }
  ledger(filter:z.infer<typeof financialFilters>) {
    return this.db.walletLedger.findMany({where:{...(filter.userId?{wallet:{userId:filter.userId}}:{}),...(filter.environment?{isSandbox:filter.environment==='sandbox'}:{})},...pageArgs(filter),orderBy:[{createdAt:'desc'},{id:'desc'}],include:{wallet:{select:{userId:true}}}});
  }
  async payments(filter:z.infer<typeof financialFilters>) {
    const rows=await this.db.paymentTransaction.findMany({where:{userId:filter.userId,...(filter.environment?{isSandbox:filter.environment==='sandbox'}:{})},...pageArgs(filter),orderBy:[{createdAt:'desc'},{id:'desc'}]});
    return rows.map(row=>{const payment=safePayment(row);return {transactionId:payment.transactionId,status:payment.status,amountMinor:payment.amountMinor,currency:payment.currency,isSandbox:payment.isSandbox,expiresAt:payment.expiresAt,userId:row.userId,createdAt:row.createdAt,verifiedAt:row.verifiedAt,riskLevel:row.riskLevel,lastErrorCode:row.lastErrorCode};});
  }
  adjust(userId:string,input:unknown,key:string,actorId:string,requestId:string) {
    const data=adjustmentInput.parse(input);
    const metadata=data.metadata?Object.fromEntries(Object.entries(data.metadata).sort(([a],[b])=>a.localeCompare(b))):undefined;
    const hash=fingerprint({...data,metadata,userId,actorId});
    return this.db.$transaction(async tx=>{
      const actor=await tx.user.findUniqueOrThrow({where:{id:actorId}});
      if(actor.role!=='ADMIN' || actor.status!=='ACTIVE') throw new ApiError(403,'FORBIDDEN','Active admin role required');
      // Use the same payment -> wallet lock order as settlement when reversing a payment.
      const original=data.kind==='REVERSAL'?await tx.walletLedger.findFirstOrThrow({where:{id:data.ledgerId,wallet:{userId}}}):null;
      if(original?.paymentId) await tx.$queryRaw`SELECT id FROM "PaymentTransaction" WHERE id = ${original.paymentId} FOR UPDATE`;
      const wallet=await lockWallet(tx,userId);
      const operationKey=`admin:${actorId}:${key}`;
      const existing=await tx.walletLedger.findUnique({where:{walletId_idempotencyKey:{walletId:wallet.id,idempotencyKey:operationKey}}});
      if(existing) { if(existing.requestHash!==hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Idempotency key was used for a different adjustment'); return existing; }
      if(original && ['REVERSAL','RESERVATION','RESERVATION_RELEASE'].includes(original.kind)) throw new ApiError(422,'INVALID_REVERSAL','This ledger type cannot be reversed');
      if(original && await tx.walletLedger.findFirst({where:{relatedLedgerId:original.id,kind:'REVERSAL'}})) throw new ApiError(409,'ALREADY_REVERSED','This entry has already been reversed');
      const amountMinor=data.kind==='REVERSAL'?-original!.amountMinor:data.kind==='ADMIN_DEBIT'?-data.amountMinor:data.amountMinor;
      const entry=await postLedger(tx,{userId,actorId,kind:data.kind,amountMinor,key:operationKey,description:data.reason,hash,metadata,
        relatedLedgerId:original?.id,paymentId:original?.paymentId??undefined,sessionId:original?.sessionId??undefined,isSandbox:original?.isSandbox??true});
      if(original?.kind==='TOP_UP' && original.paymentId) await tx.paymentTransaction.update({where:{id:original.paymentId},data:{status:'REVERSED'}});
      await tx.auditLog.create({data:{actorId,action:`WALLET_${data.kind}`,targetType:'Wallet',targetId:wallet.id,reason:data.reason,requestId,
        before:{balanceMinor:wallet.balanceMinor.toString()},after:{balanceMinor:entry.balanceAfterMinor.toString(),amountMinor:entry.amountMinor.toString(),ledgerId:entry.id,kind:entry.kind}}});
      return entry;
    });
  }
}

