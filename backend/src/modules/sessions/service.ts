import type { Database } from '../../shared/database/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { pageArgs } from '../../shared/validation/common.js';
// Safe, bounded readings and command status. Never send command payloads/credentials to owners.
export const sessionInclude = { vehicle: true, reservation: true, telemetry: { orderBy: { recordedAt: 'desc' }, take: 120 }, events: { orderBy: { createdAt: 'desc' }, take: 100 }, commands: { orderBy: { issuedAt: 'desc' }, take: 50, select: {id:true,deviceId:true,bayId:true,sessionId:true,actorId:true,type:true,status:true,issuedAt:true,expiresAt:true,failureCode:true} } } satisfies Prisma.ChargingSessionInclude;
export const activeSessionStatuses = ['CREATED','AWAITING_PLUG','READY','START_PENDING','CHARGING','STOP_PENDING','INTERRUPTED','PENDING','STARTING','STOPPING'] as const;
export class SessionService {
  constructor(private db: Database) {}
  list(ownerId: string, p: { page: number; limit: number }) { return this.db.chargingSession.findMany({ where: { ownerId }, ...pageArgs(p), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include:sessionInclude }); }
}
