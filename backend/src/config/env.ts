import 'dotenv/config';
import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url().refine(v => /^postgres(?:ql)?:/.test(v)),
  CORS_ORIGINS: z.string().min(1).transform(v => v.split(',').map(s => s.trim())).pipe(z.array(z.url().refine(v => new URL(v).origin === v)).min(1)),
  FIREBASE_PROJECT_ID: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});
export type Env = z.infer<typeof envSchema>;
export const readEnv = () => envSchema.parse(process.env);
