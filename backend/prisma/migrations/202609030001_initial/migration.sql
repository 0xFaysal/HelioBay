-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EV_OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "StationStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'FAULT', 'DISABLED');

-- CreateEnum
CREATE TYPE "BayStatus" AS ENUM ('AVAILABLE', 'PLUGGED', 'STARTING', 'CHARGING', 'STOPPING', 'FAULT', 'OFFLINE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'STARTING', 'CHARGING', 'STOPPING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'FAILED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('START', 'STOP', 'EMERGENCY_STOP', 'TEST', 'RESTART');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'SETTLED', 'RELEASED');

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('TOP_UP', 'CHARGING_DEBIT', 'ADJUSTMENT', 'REVERSAL', 'DEMO_CREDIT');

-- CreateEnum
CREATE TYPE "FaultStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EV_OWNER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "capacityWh" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceMinor" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedger" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "balanceAfterMinor" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "paymentId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinorPerKwh" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "status" "StationStatus" NOT NULL DEFAULT 'OFFLINE',
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "openingHours" TEXT,
    "solarCapable" BOOLEAN NOT NULL DEFAULT false,
    "batteryCapable" BOOLEAN NOT NULL DEFAULT false,
    "tariffId" TEXT NOT NULL,
    "primaryDeviceId" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "firmwareVersion" TEXT,
    "mqttClientId" TEXT NOT NULL,
    "credentialRef" TEXT,
    "hardwareMetadata" JSONB,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bay" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "connectorType" TEXT NOT NULL,
    "relayChannel" INTEGER NOT NULL,
    "status" "BayStatus" NOT NULL DEFAULT 'OFFLINE',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxPowerW" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargingSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "bayId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "tariffMinorPerKwh" INTEGER NOT NULL,
    "energyMWh" BIGINT NOT NULL DEFAULT 0,
    "costMinor" BIGINT NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "requestId" TEXT NOT NULL,
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ChargingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetrySample" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "sequence" BIGINT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "energyMWh" BIGINT NOT NULL,
    "powerW" INTEGER,
    "voltageMv" INTEGER,
    "currentMa" INTEGER,
    "source" TEXT NOT NULL,
    "simulated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TelemetrySample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCommand" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "bayId" TEXT,
    "sessionId" TEXT,
    "actorId" TEXT NOT NULL,
    "type" "CommandType" NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReservation" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fault" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "bayId" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FaultStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Fault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Vehicle_ownerId_createdAt_idx" ON "Vehicle"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_ownerId_plate_key" ON "Vehicle"("ownerId", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_reference_key" ON "WalletLedger"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_paymentId_key" ON "WalletLedger"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletLedger_sessionId_key" ON "WalletLedger"("sessionId");

-- CreateIndex
CREATE INDEX "WalletLedger_walletId_createdAt_idx" ON "WalletLedger"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Station_primaryDeviceId_key" ON "Station"("primaryDeviceId");

-- CreateIndex
CREATE INDEX "Station_latitude_longitude_idx" ON "Station"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "Station_status_idx" ON "Station"("status");

-- CreateIndex
CREATE INDEX "Station_tariffId_idx" ON "Station"("tariffId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_publicId_key" ON "Device"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_mqttClientId_key" ON "Device"("mqttClientId");

-- CreateIndex
CREATE INDEX "Device_stationId_status_idx" ON "Device"("stationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Device_id_stationId_key" ON "Device"("id", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "Bay_code_key" ON "Bay"("code");

-- CreateIndex
CREATE INDEX "Bay_stationId_status_idx" ON "Bay"("stationId", "status");

-- CreateIndex
CREATE INDEX "Bay_deviceId_stationId_idx" ON "Bay"("deviceId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "Bay_stationId_number_key" ON "Bay"("stationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Bay_stationId_relayChannel_key" ON "Bay"("stationId", "relayChannel");

-- CreateIndex
CREATE UNIQUE INDEX "Bay_id_stationId_deviceId_key" ON "Bay"("id", "stationId", "deviceId");

-- CreateIndex
CREATE INDEX "ChargingSession_ownerId_createdAt_idx" ON "ChargingSession"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ChargingSession_bayId_stationId_deviceId_idx" ON "ChargingSession"("bayId", "stationId", "deviceId");

-- CreateIndex
CREATE INDEX "ChargingSession_deviceId_idx" ON "ChargingSession"("deviceId");

-- CreateIndex
CREATE INDEX "ChargingSession_stationId_idx" ON "ChargingSession"("stationId");

-- CreateIndex
CREATE INDEX "ChargingSession_vehicleId_idx" ON "ChargingSession"("vehicleId");

-- CreateIndex
CREATE INDEX "ChargingSession_tariffId_idx" ON "ChargingSession"("tariffId");

-- CreateIndex
CREATE UNIQUE INDEX "ChargingSession_ownerId_requestId_key" ON "ChargingSession"("ownerId", "requestId");

-- CreateIndex
CREATE INDEX "TelemetrySample_sessionId_recordedAt_idx" ON "TelemetrySample"("sessionId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelemetrySample_deviceId_sequence_key" ON "TelemetrySample"("deviceId", "sequence");

-- CreateIndex
CREATE INDEX "DeviceCommand_deviceId_status_idx" ON "DeviceCommand"("deviceId", "status");

-- CreateIndex
CREATE INDEX "DeviceCommand_sessionId_idx" ON "DeviceCommand"("sessionId");

-- CreateIndex
CREATE INDEX "DeviceCommand_bayId_idx" ON "DeviceCommand"("bayId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCommand_actorId_idempotencyKey_key" ON "DeviceCommand"("actorId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerReference_key" ON "PaymentTransaction"("providerReference");

-- CreateIndex
CREATE INDEX "PaymentTransaction_userId_createdAt_idx" ON "PaymentTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_userId_idempotencyKey_key" ON "PaymentTransaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReservation_sessionId_key" ON "CreditReservation"("sessionId");

-- CreateIndex
CREATE INDEX "CreditReservation_walletId_status_idx" ON "CreditReservation"("walletId", "status");

-- CreateIndex
CREATE INDEX "Fault_deviceId_status_idx" ON "Fault"("deviceId", "status");

-- CreateIndex
CREATE INDEX "Fault_bayId_idx" ON "Fault"("bayId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedger" ADD CONSTRAINT "WalletLedger_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_primaryDeviceId_fkey" FOREIGN KEY ("primaryDeviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bay" ADD CONSTRAINT "Bay_deviceId_stationId_fkey" FOREIGN KEY ("deviceId", "stationId") REFERENCES "Device"("id", "stationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_bayId_stationId_deviceId_fkey" FOREIGN KEY ("bayId", "stationId", "deviceId") REFERENCES "Bay"("id", "stationId", "deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChargingSession" ADD CONSTRAINT "ChargingSession_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySample" ADD CONSTRAINT "TelemetrySample_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelemetrySample" ADD CONSTRAINT "TelemetrySample_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCommand" ADD CONSTRAINT "DeviceCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReservation" ADD CONSTRAINT "CreditReservation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChargingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fault" ADD CONSTRAINT "Fault_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fault" ADD CONSTRAINT "Fault_bayId_fkey" FOREIGN KEY ("bayId") REFERENCES "Bay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
