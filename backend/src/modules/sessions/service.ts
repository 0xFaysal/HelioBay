import type { Database } from '../../shared/database/client.js';
import { pageArgs } from '../../shared/validation/common.js';
export const activeSessionStatuses = ['CREATED','AWAITING_PLUG','READY','START_PENDING','CHARGING','STOP_PENDING','INTERRUPTED','PENDING','STARTING','STOPPING'] as const;
export class SessionService {
  constructor(private db: Database) {}
  list(ownerId: string, p: { page: number; limit: number }) { return this.db.chargingSession.findMany({ where: { ownerId }, ...pageArgs(p), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); }
}
