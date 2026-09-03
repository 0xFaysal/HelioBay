import { chargingRoutes } from './modules/sessions/controller.js';
import { iotAdminRoutes } from './modules/admin/iot-controller.js';
import type { ChargingEngine } from './modules/sessions/engine.js';
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
import { AdminWalletService } from './modules/admin/wallet-service.js';
import { adminWalletRoutes } from './modules/admin/wallet-controller.js';
import { adminRoutes } from './modules/admin/controller.js';
import { PaymentService } from './modules/payments/service.js';
import { callbackRoutes } from './modules/payments/callback-controller.js';
import { topupRoutes } from './modules/payments/controller.js';
export function mountApi(app: Express, db: Database, verify: TokenVerifier, payments = new PaymentService(db,null,null), engine?:ChargingEngine) {
  const auth = authenticate(verify, new AuthRepository(db));
  if(engine){app.use('/api/v1/charging-sessions',auth,chargingRoutes(engine));app.use('/api/v1/admin',auth,authorize('ADMIN'),iotAdminRoutes(engine));}
  app.use('/api/v1/stations', stationRoutes(new StationService(new StationRepository(db))));
  app.use('/api/v1/payments/sslcommerz', callbackRoutes(payments));
  app.use('/api/v1/wallet', auth, topupRoutes(payments));
  app.use('/api/v1/me', auth, userRoutes(new UserService(db), new WalletService(db), new SessionService(db)));
  app.use('/api/v1/admin', auth, authorize('ADMIN'), adminRoutes(new AdminService(db)), adminWalletRoutes(new AdminWalletService(db)));
}

