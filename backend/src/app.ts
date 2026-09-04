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
export function createApp(env: Env, readiness: () => Promise<unknown> = async () => {}, options: { apiRateLimit?: number } = {}) {
  const app = express();
  const logger = makeLogger(env.LOG_LEVEL);
  app.disable('x-powered-by'); app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.set('json replacer', (_key: string, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  app.use((_req, res, next) => { res.locals.requestId = randomUUID(); res.locals.logger = logger; res.setHeader('X-Request-ID', res.locals.requestId); res.on('finish', () => logger.info({ requestId: res.locals.requestId, status: res.statusCode }, 'Request completed')); next(); });
  app.use(helmet());
  const localOrigin = (origin: string) => {
    try {
      const url = new URL(origin);
      return url.protocol === 'http:' && url.port === '8080' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || /^10\./.test(url.hostname) || /^192\.168\./.test(url.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname));
    } catch { return false; }
  };
  const browserCors = cors({ origin(origin, cb) { const allowed=!origin || env.CORS_ORIGINS.includes(origin) || env.APP_MODE === 'local' && localOrigin(origin); cb(allowed ? null : new ApiError(403, 'ORIGIN_DENIED', 'Origin not allowed'), true); } });
  // Hosted gateway POST navigation/IPN is public and authenticated by server-side validation.
  app.use((req,res,next) => {
    if(req.method==='POST' && /^\/api\/v1\/payments\/sslcommerz\/(success|fail|cancel|ipn)$/.test(req.path)) next();
    else browserCors(req,res,next);
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: options.apiRateLimit ?? 120, standardHeaders: 'draft-8', legacyHeaders: false, handler: (_req, _res, next) => next(new ApiError(429, 'RATE_LIMITED', 'Too many requests')) }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health/live', (_req, res) => ok(res, { status: 'ok' }));
  app.get('/health/ready', async (_req, res) => { try { await readiness(); ok(res, { status: 'ready' }); } catch { throw new ApiError(503, 'NOT_READY', 'Database unavailable'); } });
  return app;
}
export function finishApp(app: express.Express) {
  app.use((_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Resource not found'))); app.use(errorHandler); return app;
}
