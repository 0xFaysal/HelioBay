import type { Prisma } from '../../generated/prisma/client.js';
export interface AuditContext { actorId: string; requestId: string; reason?: string }
// Explicit allowlist: never serialize arbitrary device metadata, credentials or personal profiles.
export function summary(record: unknown): Prisma.InputJsonObject {
  const safe: Record<string, string | number | boolean | null> = {};
  if (!record || typeof record !== 'object') return safe;
  for (const key of ['id','code','publicId','status','enabled','stationId','deviceId','primaryDeviceId','tariffId','relayChannel','number','maxPowerW','priceMinorPerKwh','active','isOpen']) {
    const value = (record as Record<string, unknown>)[key];
    if (value === null || ['string','number','boolean'].includes(typeof value)) safe[key] = value as string | number | boolean | null;
  }
  return safe;
}
export function writeAudit(tx: Prisma.TransactionClient, ctx: AuditContext, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
  return tx.auditLog.create({ data: { ...ctx, action, targetType, targetId, before: summary(before), after: summary(after) } });
}
