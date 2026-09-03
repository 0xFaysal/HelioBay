-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'VALIDATING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAID';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE 'RISK_REVIEW';
ALTER TYPE "PaymentStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "gatewayPageUrl" TEXT,
ADD COLUMN     "gatewaySessionKey" TEXT,
ADD COLUMN     "gatewayStatus" TEXT,
ADD COLUMN     "isSandbox" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "requestHash" TEXT,
ADD COLUMN     "riskLevel" INTEGER;

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_lastCheckedAt_idx" ON "PaymentTransaction"("status", "lastCheckedAt");
