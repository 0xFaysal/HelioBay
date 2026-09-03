import type { Express } from 'express';
import type { Database } from './shared/database/client.js';
import type { TokenVerifier } from './modules/auth/firebase.js';
import { authenticate, authorize } from './modules/auth/middleware.js';
import { AuthRepository } from './modules/auth/repository.js';
import { StationRepository } from './modules/stations/repository.js';
import { StationService } from './modules/stations/service.js';
import { stationRoutes } from './modules/stations/controller.js';
import { UserService } from './modules/users/service.js';
import { userRoutes } from './modules/users/controller.js';
import { WalletService } from './modules/wallets/service.js';
import { SessionService } from './modules/sessions/service.js';
import { AdminService } from './modules/admin/service.js';
import { adminRoutes } from './modules/admin/controller.js';
export function mountApi(app: Express, db: Database, verify: TokenVerifier) {
  const auth = authenticate(verify, new AuthRepository(db));
  app.use('/api/v1/stations', stationRoutes(new StationService(new StationRepository(db))));
  app.use('/api/v1/me', auth, userRoutes(new UserService(db), new WalletService(db), new SessionService(db)));
  app.use('/api/v1/admin', auth, authorize('ADMIN'), adminRoutes(new AdminService(db)));
}
