ALTER TABLE "User" ADD COLUMN "preferences" JSONB NOT NULL DEFAULT '{"charging":true,"wallet":true,"offers":false}',
  ADD COLUMN "savedStations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Vehicle" ADD COLUMN "estimatedSocPct" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Vehicle" ADD CONSTRAINT "vehicle_estimated_soc_range" CHECK ("estimatedSocPct" BETWEEN 0 AND 100);
