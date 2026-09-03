import { Router } from 'express';
import { ok } from '../../shared/http.js';
import { id } from '../../shared/validation/common.js';
import { idempotencyKey } from '../wallets/ledger.js';
import type { ChargingEngine } from './engine.js';
export function chargingRoutes(engine: ChargingEngine) {
    const r = Router();
    r.post('/start', async (req, res) => ok(res, await engine.start(req.user!.id, req.body, idempotencyKey.parse(req.headers['idempotency-key']), res.locals.requestId), 202));
    r.post('/:sessionId/stop', async (req, res) => ok(res, await engine.stop(id.parse(req.params.sessionId), req.user!.id, 'USER_STOPPED', idempotencyKey.parse(req.headers['idempotency-key']), res.locals.requestId), 202));
    r.get('/:sessionId', async (req, res) => ok(res, await engine.db.chargingSession.findFirstOrThrow({ where: { id: id.parse(req.params.sessionId), ownerId: req.user!.id }, include: { reservation: true, events: { orderBy: { createdAt: 'asc' }, take: 100 } } })));
    return r;
}
