-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerKind" ADD VALUE 'ADMIN_CREDIT';
ALTER TYPE "LedgerKind" ADD VALUE 'ADMIN_DEBIT';
ALTER TYPE "LedgerKind" ADD VALUE 'REFUND';
ALTER TYPE "LedgerKind" ADD VALUE 'RESERVATION';
ALTER TYPE "LedgerKind" ADD VALUE 'RESERVATION_RELEASE';

-- DropIndex
DROP INDEX "WalletLedger_paymentId_key";

-- DropIndex
DROP INDEX "WalletLedger_sessionId_key";

-- AlterTable
ALTER TABLE "WalletLedger" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "isSandbox" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "relatedLedgerId" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "reservationId" TEXT;

-- Populate new identity fields without changing historical amounts or balances.
ALTER TABLE "WalletLedger" DISABLE TRIGGER immutable_ledger;
UPDATE "WalletLedger" SET "idempotencyKey" = 'legacy:' || id, description = COALESCE(reason, 'Legacy ledger entry') WHERE "idempotencyKey" IS NULL;
ALTER TABLE "WalletLedger" ENABLE TRIGGER immutable_ledger;
ALTER TABLE "WalletLedger" ALTER COLUMN "idempotencyKey" SET NOT NULL;
-- CreateIndex
CREATE INDEX "WalletLedger_actorId_idx" ON "WalletLedger"("actorId");

-- CreateIndex
CREATE INDEX "WalletLedger_paymentId_idx" ON "WalletLedger"("paymentId");

-- CreateIndex
CREATE INDEX "WalletLedger_sessionId_idx" ON "WalletLedger"("sessionId");

-- CreateIndex
CREATE INDEX "WalletLedger_reservationId_idx" ON "WalletLedger"("reservationId");

-- CreateIndex
CREATE INDEX "WalletLedger_relatedLedgerId_idx" ON "WalletLedger"("relatedLedgerId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_walletId_idempotencyKey_key" ON "WalletLedger"("walletId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "CreditReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_relatedLedgerId_fkey" FOREIGN KEY ("relatedLedgerId") REFERENCES "WalletLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

