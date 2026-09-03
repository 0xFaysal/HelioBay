import type { Database } from '../../shared/database/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { pageArgs } from '../../shared/validation/common.js';
export class WalletService {
  constructor(private db: Database) {}
  get(userId: string) {
    return this.db.$transaction(async tx => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const held = await tx.creditReservation.aggregate({ where: { walletId: wallet.id, status: 'HELD' }, _sum: { amountMinor: true } });
      return { ...wallet, heldMinor: held._sum.amountMinor ?? 0n, availableMinor: wallet.balanceMinor - (held._sum.amountMinor ?? 0n) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  ledger(userId: string, p: { page: number; limit: number }) { return this.db.walletLedger.findMany({ where: { wallet: { userId } }, ...pageArgs(p), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],include:{wallet:{select:{userId:true}}} }); }
}
