import { Router } from 'express';
import { id, pagination } from '../../shared/validation/common.js';
import { ok } from '../../shared/http.js';
import { nearestQuery } from './validation.js';
import type { StationService } from './service.js';
export function stationRoutes(service: StationService) {
  const r = Router();
  r.get('/', async (req, res) => { const p = pagination.parse(req.query); ok(res, await service.list(p), 200, p); });
  r.get('/nearest', async (req, res) => ok(res, await service.nearest(nearestQuery.parse(req.query))));
  r.get('/:stationId', async (req, res) => ok(res, await service.get(id.parse(req.params.stationId))));
  r.get('/:stationId/bays', async (req, res) => { const p = pagination.parse(req.query); ok(res, await service.bays(id.parse(req.params.stationId), p), 200, p); });
  return r;
}
