import 'dotenv/config';
import { z } from 'zod';
const publicUrl = z.url().refine(v => { const u=new URL(v); return !u.username && !u.password && !u.search && !u.hash && (u.protocol==='https:' || (u.protocol==='http:' && ['localhost','127.0.0.1'].includes(u.hostname))); }, 'Use HTTPS, or HTTP localhost for local development');
export const paymentConfigSchema = z.object({
  SSLCOMMERZ_STORE_ID: z.string().min(1).max(100),
  SSLCOMMERZ_STORE_PASSWORD: z.string().min(1).max(200),
  SSLCOMMERZ_IS_LIVE: z.literal('false').default('false'),
  PUBLIC_APP_URL: publicUrl,
  API_PUBLIC_URL: publicUrl,
  MAX_TOPUP_CREDITS: z.coerce.number().int().min(10).max(500000).default(10000),
  PAYMENT_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  PAYMENT_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
});
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;
export function readPaymentConfig(): PaymentConfig | null {
  if (process.env.SSLCOMMERZ_IS_LIVE && process.env.SSLCOMMERZ_IS_LIVE !== 'false') throw new Error('Only SSLCOMMERZ Sandbox is supported');
  if (!process.env.SSLCOMMERZ_STORE_ID && !process.env.SSLCOMMERZ_STORE_PASSWORD) return null;
  return paymentConfigSchema.parse(process.env);
}
