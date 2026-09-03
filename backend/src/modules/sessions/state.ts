import type { Prisma,ChargingSession,SessionStatus } from '../../generated/prisma/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
const allowed:Partial<Record<SessionStatus,SessionStatus[]>>={CREATED:['AWAITING_PLUG','READY','FAILED'],AWAITING_PLUG:['READY','FAILED'],READY:['START_PENDING','FAILED'],START_PENDING:['CHARGING','STOP_PENDING','FAILED','INTERRUPTED'],CHARGING:['STOP_PENDING','INTERRUPTED'],STOP_PENDING:['COMPLETED','FAILED','INTERRUPTED'],INTERRUPTED:['STOP_PENDING','COMPLETED','FAILED'],PENDING:['READY','STOP_PENDING','INTERRUPTED'],STARTING:['CHARGING','STOP_PENDING','INTERRUPTED'],STOPPING:['COMPLETED','INTERRUPTED']};
export async function transition(tx:Prisma.TransactionClient,session:ChargingSession,to:SessionStatus) {
  if(session.status===to)return session;
  if(!allowed[session.status]?.includes(to))throw new ApiError(409,'INVALID_SESSION_TRANSITION',`Cannot transition ${session.status} to ${to}`);
  const updated=await tx.chargingSession.update({where:{id:session.id},data:{status:to}});
  await tx.sessionEvent.create({data:{sessionId:session.id,type:'STATE_CHANGED',data:{from:session.status,to}}});return updated;
}
export const stopReasons=['BATTERY_FULL','CREDIT_EXHAUSTED','PLUG_DISCONNECTED','USER_STOPPED','ADMIN_STOPPED','EMERGENCY_STOP','DEVICE_OFFLINE','SAFETY_FAULT','MAX_ENERGY_REACHED','MAX_DURATION_REACHED'] as const;
export type StopReason=typeof stopReasons[number];
