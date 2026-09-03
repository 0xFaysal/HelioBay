import { createApp, finishApp } from './app.js';
import { readEnv } from './config/env.js';
import { makeDatabase } from './shared/database/client.js';
import { firebaseVerifier } from './modules/auth/firebase.js';
import { mountApi } from './routes.js';
const env = readEnv();
const db = makeDatabase(env.DATABASE_URL);
const app = createApp(env, () => db.$queryRaw`SELECT 1`);
mountApi(app, db, firebaseVerifier(env.FIREBASE_PROJECT_ID));
const server = finishApp(app).listen(env.PORT);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (closing) return; closing = true;
  const timer = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => { void db.$disconnect().finally(() => { clearTimeout(timer); process.exit(0); }); });
});

