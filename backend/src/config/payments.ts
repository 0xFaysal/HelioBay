import 'dotenv/config';
import { z } from 'zod';

const publicUrl = z.url().refine(v => {
  const u=new URL(v);
  return !u.username && !u.password && !u.search && !u.hash && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname)));
}, 'Use HTTPS, or HTTP localhost for local development');
const common = {
  PUBLIC_APP_URL: publicUrl,
  API_PUBLIC_URL: publicUrl,
  MAX_TOPUP_CREDITS: z.coerce.number().int().min(10).max(500000).default(10000),
  PAYMENT_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  PAYMENT_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
};
export const paymentConfigSchema = z.object({
  PAYMENT_PROVIDER: z.literal('sslcommerz').default('sslcommerz'),
  SSLCOMMERZ_STORE_ID: z.string().min(1).max(100),
  SSLCOMMERZ_STORE_PASSWORD: z.string().min(1).max(200),
  SSLCOMMERZ_IS_LIVE: z.literal('false').default('false'),
  ...common,
});
export const localPaymentConfigSchema = z.object({
  PAYMENT_PROVIDER: z.literal('local-sandbox'),
  APP_MODE: z.literal('local'),
  NODE_ENV: z.enum(['development','test']),
  ...common,
});
export type SslcommerzPaymentConfig = z.infer<typeof paymentConfigSchema>;
export type LocalPaymentConfig = z.infer<typeof localPaymentConfigSchema>;
export type PaymentConfig = SslcommerzPaymentConfig | LocalPaymentConfig;

export function readPaymentConfig(): PaymentConfig | null {
  if (process.env.PAYMENT_PROVIDER === 'local-sandbox') return localPaymentConfigSchema.parse(process.env);
  if (process.env.SSLCOMMERZ_IS_LIVE && process.env.SSLCOMMERZ_IS_LIVE !== 'false') throw new Error('Only SSLCOMMERZ Sandbox is supported');
  if (!process.env.SSLCOMMERZ_STORE_ID && !process.env.SSLCOMMERZ_STORE_PASSWORD) return null;
  return paymentConfigSchema.parse({ ...process.env, PAYMENT_PROVIDER: 'sslcommerz' });
}
