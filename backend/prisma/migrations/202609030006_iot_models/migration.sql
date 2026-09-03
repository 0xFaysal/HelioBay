-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('LIVE_HARDWARE', 'ESTIMATED', 'DIGITAL_TWIN', 'SIMULATOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SessionStatus" ADD VALUE 'CREATED';
ALTER TYPE "SessionStatus" ADD VALUE 'AWAITING_PLUG';
ALTER TYPE "SessionStatus" ADD VALUE 'READY';
ALTER TYPE "SessionStatus" ADD VALUE 'START_PENDING';
ALTER TYPE "SessionStatus" ADD VALUE 'STOP_PENDING';
ALTER TYPE "SessionStatus" ADD VALUE 'INTERRUPTED';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "bootId" TEXT,
ADD COLUMN     "dataSource" "DataSource" NOT NULL DEFAULT 'LIVE_HARDWARE',
ADD COLUMN     "lastSampleAt" TIMESTAMP(3),
ADD COLUMN     "lastSequence" BIGINT NOT NULL DEFAULT -1,
ADD COLUMN     "lastTelemetry" JSONB,
ADD COLUMN     "simulationSpeed" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "thresholds" JSONB;

-- AlterTable
ALTER TABLE "Bay" ADD COLUMN     "lastTelemetry" JSONB,
ADD COLUMN     "lastTelemetryAt" TIMESTAMP(3),
ADD COLUMN     "plugConnected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "relayOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "thresholds" JSONB;

-- AlterTable
ALTER TABLE "ChargingSession" ADD COLUMN     "dataSource" "DataSource" NOT NULL DEFAULT 'LIVE_HARDWARE',
ADD COLUMN     "endingBalanceMinor" BIGINT,
ADD COLUMN     "lastTelemetryAt" TIMESTAMP(3),
ADD COLUMN     "lowCreditWarned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxDurationSeconds" INTEGER NOT NULL DEFAULT 3600,
ADD COLUMN     "maxEnergyMWh" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "receipt" JSONB,
ADD COLUMN     "reconciliationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reservedMinor" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "startRequestHash" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "TelemetrySample" ADD COLUMN     "bayId" TEXT,
ADD COLUMN     "dataSource" "DataSource" NOT NULL DEFAULT 'LIVE_HARDWARE',
ADD COLUMN     "measurements" JSONB;

-- AlterTable
ALTER TABLE "DeviceCommand" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "payload" JSONB,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "requestHash" TEXT;

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_createdAt_idx" ON "SessionEvent"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
