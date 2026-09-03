import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../shared/http.js';
import { id, pagination } from '../../shared/validation/common.js';
import { mutationBody } from './validation.js';
import type { AdminService, Resource } from './service.js';
export function adminRoutes(service: AdminService) {
  const r = Router();
  r.get('/users', async (req, res) => { const p = pagination.extend({ search: z.string().max(100).optional() }).parse(req.query); ok(res, await service.users(p), 200, p); });
  r.get('/users/:id', async (req, res) => ok(res, await service.user(id.parse(req.params.id))));
  r.patch('/users/:id', async (req, res) => ok(res, await service.changeUser(id.parse(req.params.id), req.body, { actorId: req.user!.id, requestId: res.locals.requestId })));
  r.get('/audit-logs', async (req, res) => { const p = pagination.parse(req.query); ok(res, await service.audit(p), 200, p); });
  for (const resource of ['stations','bays','devices','tariffs'] as Resource[]) {
    r.get(`/${resource}`, async (req, res) => { const p = pagination.parse(req.query); ok(res, await service.list(resource, p), 200, p); });
    r.get(`/${resource}/:id`, async (req, res) => ok(res, await service.get(resource, id.parse(req.params.id))));
    for (const method of ['post','patch','delete'] as const) r[method](`/${resource}${method === 'post' ? '' : '/:id'}`, async (req, res) => {
      const body = mutationBody.parse(req.body ?? {});
      ok(res, await service.mutate(resource, method === 'post' ? 'CREATE' : method === 'patch' ? 'UPDATE' : 'DELETE', method === 'post' ? undefined : id.parse((req.params as Record<string, string>).id), body.data, { actorId: req.user!.id, requestId: res.locals.requestId, reason: body.reason }), method === 'post' ? 201 : 200);
    });
  }
  return r;
}

