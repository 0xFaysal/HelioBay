CREATE TABLE "StationEnergyPolicy" (
  "id" TEXT PRIMARY KEY, "stationId" TEXT NOT NULL UNIQUE,
  "capacityWh" INTEGER NOT NULL DEFAULT 120000,
  "minSocPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
  "maxSocPct" DOUBLE PRECISION NOT NULL DEFAULT 95,
  "maxChargeW" INTEGER NOT NULL DEFAULT 40000,
  "maxDischargeW" INTEGER NOT NULL DEFAULT 30000,
  "auxiliaryW" INTEGER NOT NULL DEFAULT 500,
  "importTariffMinor" INTEGER NOT NULL DEFAULT 0,
  "exportTariffMinor" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StationEnergyPolicy_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT,
  CONSTRAINT "energy_policy_values" CHECK ("capacityWh">0 AND "minSocPct">=0 AND "maxSocPct"<=100 AND "minSocPct"<"maxSocPct" AND "maxChargeW">=0 AND "maxDischargeW">=0 AND "auxiliaryW">=0 AND "importTariffMinor">=0 AND "exportTariffMinor">=0)
);
CREATE TABLE "StationEnergySample" (
  "id" TEXT PRIMARY KEY, "stationId" TEXT NOT NULL, "telemetryId" TEXT NOT NULL UNIQUE,
  "recordedAt" TIMESTAMP(3) NOT NULL, "durationMs" INTEGER NOT NULL,
  "solarMWh" BIGINT NOT NULL, "evMWh" BIGINT NOT NULL, "importMWh" BIGINT NOT NULL, "exportMWh" BIGINT NOT NULL,
  "batterySocPct" DOUBLE PRECISION NOT NULL, "batteryPowerW" INTEGER NOT NULL,
  "importTariffMinor" INTEGER NOT NULL, "exportTariffMinor" INTEGER NOT NULL, "dataSource" "DataSource" NOT NULL,
  CONSTRAINT "StationEnergySample_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT,
  CONSTRAINT "StationEnergySample_telemetryId_fkey" FOREIGN KEY ("telemetryId") REFERENCES "TelemetrySample"("id") ON DELETE RESTRICT,
  CONSTRAINT "energy_sample_values" CHECK ("durationMs">=0 AND "solarMWh">=0 AND "evMWh">=0 AND "importMWh">=0 AND "exportMWh">=0 AND "batterySocPct">=0 AND "batterySocPct"<=100)
);
CREATE INDEX "StationEnergySample_stationId_recordedAt_idx" ON "StationEnergySample"("stationId","recordedAt");
