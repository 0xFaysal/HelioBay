import type { Database } from '../../shared/database/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { fingerprint,lockWallet,postLedger } from './ledger.js';
/** Internal charging integration API; no client can inject holds or settlement amounts. */
export class CreditReservations {
  constructor(private db:Database) {}
  reserve(userId:string,sessionId:string,amountMinor:bigint,key:string,actorId:string) {
    if(amountMinor<=0n) throw new ApiError(422,'INVALID_RESERVATION','Reservation must be positive');
    return this.db.$transaction(async tx=>{
      const wallet=await lockWallet(tx,userId);
      await tx.chargingSession.findFirstOrThrow({where:{id:sessionId,ownerId:userId,status:{in:['CREATED','READY','START_PENDING','PENDING','STARTING','CHARGING']}}});
      const hash=fingerprint({userId,sessionId,amountMinor,operation:'reserve'});
      const existing=await tx.creditReservation.findUnique({where:{sessionId}});
      if(existing) {
        const entry=await tx.walletLedger.findUnique({where:{walletId_idempotencyKey:{walletId:wallet.id,idempotencyKey:key}}});
        if(entry?.requestHash===hash && existing.amountMinor===amountMinor) return existing;
        throw new ApiError(409,'RESERVATION_EXISTS','Session already has a reservation');
      }
      const held=await tx.creditReservation.aggregate({where:{walletId:wallet.id,status:'HELD'},_sum:{amountMinor:true}});
      if(wallet.balanceMinor-(held._sum.amountMinor??0n)<amountMinor) throw new ApiError(422,'INSUFFICIENT_BALANCE','Insufficient available Credits');
      const reservation=await tx.creditReservation.create({data:{walletId:wallet.id,sessionId,amountMinor}});
      await postLedger(tx,{userId,actorId,kind:'RESERVATION',amountMinor:-amountMinor,key,hash,description:'Credits reserved for charging',reservationId:reservation.id,sessionId});
      return reservation;
    });
  }
  release(userId:string,sessionId:string,key:string,actorId:string) {
    return this.db.$transaction(async tx=>{
      const wallet=await lockWallet(tx,userId);
      const reservation=await tx.creditReservation.findFirstOrThrow({where:{sessionId,walletId:wallet.id}});
      const hash=fingerprint({userId,sessionId,operation:'release'});
      const existing=await tx.walletLedger.findUnique({where:{walletId_idempotencyKey:{walletId:wallet.id,idempotencyKey:key}}});
      if(existing) {if(existing.requestHash!==hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT','Key already used');return existing;}
      if(reservation.status!=='HELD') throw new ApiError(409,'RESERVATION_CLOSED','Reservation is already closed');
      await tx.creditReservation.update({where:{id:reservation.id},data:{status:'RELEASED'}});
      return postLedger(tx,{userId,actorId,kind:'RESERVATION_RELEASE',amountMinor:reservation.amountMinor,key,hash,description:'Charging Credit reservation released',reservationId:reservation.id,sessionId});
    });
  }
}
