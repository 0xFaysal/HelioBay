import type { Database } from '../../shared/database/client.js';
import type { DecodedIdToken } from 'firebase-admin/auth';
export class AuthRepository {
  constructor(private db: Database) {}
  synchronize(token: DecodedIdToken) {
    // Roles and status are local administrative decisions, never client/token profile input.
    return this.db.user.upsert({ where: { firebaseUid: token.uid },
      create: { firebaseUid: token.uid, email: token.email_verified ? token.email : null, name: typeof token.name === 'string' ? token.name.slice(0, 100) : 'EV Owner', wallet: { create: {} } },
      update: { email: token.email_verified ? token.email : null },
    });
  }
}
