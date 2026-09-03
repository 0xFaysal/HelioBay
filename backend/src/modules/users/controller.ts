import { Router } from 'express';
import { ok } from '../../shared/http.js';
import { id, pagination } from '../../shared/validation/common.js';
import { profilePatch, vehicleInput, vehiclePatch } from './validation.js';
import type { UserService } from './service.js';
import type { WalletService } from '../wallets/service.js';
import type { SessionService } from '../sessions/service.js';
export function userRoutes(users: UserService, wallets: WalletService, sessions: SessionService) {
  const r = Router();
  r.get('/', async (req, res) => ok(res, await users.get(req.user!.id)));
  r.patch('/', async (req, res) => ok(res, await users.patch(req.user!.id, profilePatch.parse(req.body))));
  r.get('/vehicles', async (req, res) => { const p = pagination.parse(req.query); ok(res, await users.vehicles(req.user!.id, p), 200, p); });
  r.post('/vehicles', async (req, res) => ok(res, await users.createVehicle(req.user!.id, vehicleInput.parse(req.body)), 201));
  r.patch('/vehicles/:vehicleId', async (req, res) => ok(res, await users.mutateVehicle(req.user!.id, id.parse(req.params.vehicleId), vehiclePatch.parse(req.body))));
  r.delete('/vehicles/:vehicleId', async (req, res) => { await users.mutateVehicle(req.user!.id, id.parse(req.params.vehicleId)); ok(res, { deleted: true }); });
  r.get('/wallet', async (req, res) => ok(res, await wallets.get(req.user!.id)));
  r.get('/wallet/ledger', async (req, res) => { const p = pagination.parse(req.query); ok(res, await wallets.ledger(req.user!.id, p), 200, p); });
  r.get('/charging-sessions', async (req, res) => { const p = pagination.parse(req.query); ok(res, await sessions.list(req.user!.id, p), 200, p); });
  return r;
}
