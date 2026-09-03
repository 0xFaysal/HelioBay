import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import type { Env } from './config/env.js';
import { makeLogger } from './config/logger.js';
import { ApiError } from './shared/errors/api-error.js';
import { errorHandler } from './middleware/error-handler.js';
import { ok } from './shared/http.js';
export function createApp(env: Env, readiness: () => Promise<unknown> = async () => {}) {
  const app = express();
  const logger = makeLogger(env.LOG_LEVEL);
  app.disable('x-powered-by'); app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  app.use((_req, res, next) => { res.locals.requestId = randomUUID(); res.locals.logger = logger; res.setHeader('X-Request-ID', res.locals.requestId); res.on('finish', () => logger.info({ requestId: res.locals.requestId, status: res.statusCode }, 'Request completed')); next(); });
  app.use(helmet());
  app.use(cors({ origin(origin, cb) { cb(origin && !env.CORS_ORIGINS.includes(origin) ? new ApiError(403, 'ORIGIN_DENIED', 'Origin not allowed') : null, true); } }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests')) }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health/live', (_req, res) => ok(res, { status: 'ok' }));
  app.get('/health/ready', async (_req, res) => { try { await readiness(); ok(res, { status: 'ready' }); } catch { throw new ApiError(503, 'NOT_READY', 'Database unavailable'); } });
  return app;
}
export function finishApp(app: express.Express) {
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Resource not found'))); app.use(errorHandler); return app;
}
