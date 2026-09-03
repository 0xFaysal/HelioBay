import { createApp, finishApp } from './app.js';
import { readEnv } from './config/env.js';
const env = readEnv();
const server = finishApp(createApp(env)).listen(env.PORT);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  const timer = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => { clearTimeout(timer); process.exit(0); });
});
