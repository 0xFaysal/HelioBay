import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
export const topupInput = z.object({ credits: z.number().int().safe().min(10).max(500000) }).strict();
export function creditsToMinor(credits: number) { return BigInt(topupInput.parse({credits}).credits) * 100n; }
export function minorToBdt(amount: bigint) { return `${amount / 100n}.${(amount % 100n).toString().padStart(2,'0')}`; }
export function bdtToMinor(amount: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount)) throw new ApiError(422,'INVALID_GATEWAY_AMOUNT','Gateway amount is not valid BDT');
  const [whole, fraction=''] = amount.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2,'0'));
}
export const callbackInput = z.object({ tran_id: z.string().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/), val_id: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional() });
export const safeGatewayUrl = z.url().max(2048).refine(value => { const u=new URL(value); return u.protocol==='https:' && u.hostname==='sandbox.sslcommerz.com' && !u.port && !u.username && !u.password; }, 'Untrusted payment gateway URL');
