import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, LedgerKind } from '../../generated/prisma/client.js';
import { ApiError } from '../../shared/errors/api-error.js';
export const idempotencyKey = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9:_-]+$/);
export const metadataSchema = z.record(z.string().max(40), z.union([z.string().max(200), z.boolean(), z.number().int().safe()])).refine(v => Object.keys(v).length <= 8 && Buffer.byteLength(JSON.stringify(v)) <= 1024, 'Metadata exceeds limits');
export function fingerprint(value: Record<string, unknown>) { return createHash('sha256').update(JSON.stringify(value, (_k,v) => typeof v === 'bigint' ? v.toString() : v)).digest('hex'); }
export async function lockWallet(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return tx.wallet.findUniqueOrThrow({ where: { userId } });
}
export interface LedgerPosting {
  userId: string; actorId: string; kind: LedgerKind; amountMinor: bigint; key: string;
  description: string; hash: string; paymentId?: string; sessionId?: string; reservationId?: string;
  relatedLedgerId?: string; isSandbox?: boolean; metadata?: Prisma.InputJsonObject;
}
export async function postLedger(tx: Prisma.TransactionClient, p: LedgerPosting) {
  const wallet = await lockWallet(tx, p.userId);
  const existing = await tx.walletLedger.findUnique({ where: { walletId_idempotencyKey: { walletId: wallet.id, idempotencyKey: p.key } } });
  if (existing) {
    if (existing.requestHash !== p.hash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used for a different request');
    return existing;
  }
  const held = await tx.creditReservation.aggregate({ where: { walletId: wallet.id, status: 'HELD' }, _sum: { amountMinor: true } });
  const delta = ['RESERVATION','RESERVATION_RELEASE'].includes(p.kind) ? 0n : p.amountMinor;
  if (wallet.balanceMinor + delta < (held._sum.amountMinor ?? 0n)) throw new ApiError(422, 'INSUFFICIENT_BALANCE', 'Insufficient available Credits');
  return tx.walletLedger.create({ data: { walletId: wallet.id, actorId: p.actorId, kind: p.kind, amountMinor: p.amountMinor,
    balanceAfterMinor: wallet.balanceMinor + delta, reference: `${wallet.id}:${p.key}`, idempotencyKey: p.key, requestHash: p.hash,
    description: p.description, reason: p.description, paymentId: p.paymentId, sessionId: p.sessionId, reservationId: p.reservationId,
    relatedLedgerId: p.relatedLedgerId, isSandbox: p.isSandbox ?? true, metadata: p.metadata } });
}
