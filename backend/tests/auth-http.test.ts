import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { User } from '../src/generated/prisma/client.js';
import { createApp, finishApp } from '../src/app.js';
import { authenticate, authorize } from '../src/modules/auth/middleware.js';
import { firebaseVerifier } from '../src/modules/auth/firebase.js';
import { envSchema } from '../src/config/env.js';
import { ok } from '../src/shared/http.js';
const sdk = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => sdk }));
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], applicationDefault: vi.fn(), initializeApp: vi.fn() }));
export const env = envSchema.parse({ NODE_ENV: 'test', DATABASE_URL: 'postgresql://test:test@localhost/test', CORS_ORIGINS: 'http://localhost:3000', FIREBASE_PROJECT_ID: 'test', LOG_LEVEL: 'silent' });
const user = { id: 'u1', role: 'EV_OWNER', status: 'ACTIVE' } as User;
function appFor(record = user) {
  const app = createApp(env);
  const synchronize = vi.fn().mockResolvedValue(record);
  app.use('/private', authenticate(firebaseVerifier('test'), { synchronize }));
  app.get('/private/me', (req, res) => ok(res, req.user));
  app.get('/private/admin', authorize('ADMIN'), (_req, res) => ok(res, {}));
  return { app: finishApp(app), synchronize };
}
beforeEach(() => { sdk.verifyIdToken.mockReset(); sdk.verifyIdToken.mockResolvedValue({ uid: 'verified-uid' }); });
describe('verified Firebase authentication', () => {
  it('requires a bearer token', async () => { const { app, synchronize } = appFor(); expect((await request(app).get('/private/me')).status).toBe(401); expect(synchronize).not.toHaveBeenCalled(); });
  it('checks revocation through Admin SDK before syncing', async () => { const { app, synchronize } = appFor(); expect((await request(app).get('/private/me').auth('signed-token', { type: 'bearer' })).status).toBe(200); expect(sdk.verifyIdToken).toHaveBeenCalledWith('signed-token', true); expect(synchronize).toHaveBeenCalledWith({ uid: 'verified-uid' }); });
  it('rejects invalid signatures and does not synchronize', async () => { sdk.verifyIdToken.mockRejectedValue(new Error('secret')); const { app, synchronize } = appFor(); const res = await request(app).get('/private/me').auth('bad', { type: 'bearer' }); expect(res.status).toBe(401); expect(res.text).not.toContain('secret'); expect(synchronize).not.toHaveBeenCalled(); });
  it.each(['BLOCKED','DISABLED'] as const)('rejects %s users', async status => { const { app } = appFor({ ...user, status }); expect((await request(app).get('/private/me').auth('token', { type: 'bearer' })).status).toBe(403); });
  it('enforces backend RBAC', async () => { expect((await request(appFor().app).get('/private/admin').auth('token', { type: 'bearer' })).status).toBe(403); expect((await request(appFor({ ...user, role: 'ADMIN' }).app).get('/private/admin').auth('token', { type: 'bearer' })).status).toBe(200); });
});
describe('HTTP foundation', () => {
  it('returns request IDs and a stable 404 envelope', async () => { const res = await request(appFor().app).get('/missing'); expect(res.status).toBe(404); expect(res.body.requestId).toBe(res.headers['x-request-id']); expect(res.body.error.code).toBe('NOT_FOUND'); });
  it('rejects untrusted origins', async () => { expect((await request(appFor().app).get('/health/live').set('Origin','https://evil.example')).status).toBe(403); });
  it('reports readiness failure', async () => { const app = finishApp(createApp(env, async () => { throw new Error('credentials'); })); expect((await request(app).get('/health/ready')).status).toBe(503); });
  it('returns JSON parsing errors without payload contents', async () => { const res = await request(appFor().app).post('/private/me').set('Content-Type','application/json').send('{secret'); expect(res.status).toBe(400); expect(res.body.error.code).toBe('INVALID_JSON'); });
});

it('returns a consistent 429 when the API limit is exhausted', async () => {
  const app = appFor().app;
  for (let i = 0; i < 120; i++) await request(app).get('/api/missing');
  const res = await request(app).get('/api/missing');
  expect(res.status).toBe(429); expect(res.body.error.code).toBe('RATE_LIMITED'); expect(res.body.requestId).toBeTruthy();
});
it('sanitizes unexpected failures', async () => {
  const app = createApp(env);
  app.get('/failure', () => { throw new Error('private database credentials'); });
  finishApp(app);
  const res = await request(app).get('/failure');
  expect(res.status).toBe(500); expect(res.body.error.code).toBe('INTERNAL_ERROR'); expect(res.text).not.toContain('credentials');
});
