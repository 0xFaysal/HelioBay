-- Billing and physical hierarchy invariants, independent of application validation.
ALTER TABLE "Wallet" ADD CONSTRAINT wallet_nonnegative CHECK ("balanceMinor" >= 0 AND currency = 'BDT');
ALTER TABLE "WalletLedger" ADD CONSTRAINT ledger_nonnegative_balance CHECK ("balanceAfterMinor" >= 0);
ALTER TABLE "Tariff" ADD CONSTRAINT tariff_positive CHECK ("priceMinorPerKwh" > 0 AND currency = 'BDT');
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_capacity CHECK ("capacityWh" > 0);
ALTER TABLE "Bay" ADD CONSTRAINT bay_channel CHECK ("relayChannel" BETWEEN 1 AND 32 AND number > 0 AND "maxPowerW" > 0);
ALTER TABLE "Station" ADD CONSTRAINT station_coordinates CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT payment_positive CHECK ("amountMinor" > 0 AND currency = 'BDT');
ALTER TABLE "CreditReservation" ADD CONSTRAINT reservation_positive CHECK ("amountMinor" > 0);
ALTER TABLE "ChargingSession" ADD CONSTRAINT session_units CHECK ("energyMWh" >= 0 AND "costMinor" >= 0 AND "tariffMinorPerKwh" > 0);
ALTER TABLE "TelemetrySample" ADD CONSTRAINT telemetry_units CHECK ("energyMWh" >= 0 AND sequence >= 0);
CREATE UNIQUE INDEX one_default_vehicle_per_owner ON "Vehicle" ("ownerId") WHERE "isDefault";
CREATE UNIQUE INDEX one_active_session_per_bay ON "ChargingSession" ("bayId") WHERE status IN ('PENDING','STARTING','CHARGING','STOPPING');
CREATE UNIQUE INDEX one_active_session_per_owner ON "ChargingSession" ("ownerId") WHERE status IN ('PENDING','STARTING','CHARGING','STOPPING');
CREATE UNIQUE INDEX one_active_session_per_vehicle ON "ChargingSession" ("vehicleId") WHERE status IN ('PENDING','STARTING','CHARGING','STOPPING');

-- Composite FK guarantees the primary controller belongs to the station.
ALTER TABLE "Station" ADD CONSTRAINT station_primary_same_station FOREIGN KEY ("primaryDeviceId", id) REFERENCES "Device" (id, "stationId") DEFERRABLE INITIALLY DEFERRED;
-- Prototype constraint is deliberately named: remove it to enable multiple controllers per station later.
ALTER TABLE "Station" ADD CONSTRAINT station_id_primary_unique UNIQUE (id, "primaryDeviceId");
ALTER TABLE "Bay" ADD CONSTRAINT prototype_bay_primary_device FOREIGN KEY ("stationId", "deviceId") REFERENCES "Station" (id, "primaryDeviceId") DEFERRABLE INITIALLY DEFERRED;

-- A session must reference its owner's vehicle; other composite FKs protect hardware hierarchy.
ALTER TABLE "Vehicle" ADD CONSTRAINT vehicle_id_owner_unique UNIQUE (id, "ownerId");
ALTER TABLE "ChargingSession" ADD CONSTRAINT session_vehicle_owner FOREIGN KEY ("vehicleId", "ownerId") REFERENCES "Vehicle" (id, "ownerId");

CREATE FUNCTION heliobay_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial ledger and audit records are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION heliobay_immutable_record();
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON "WalletLedger" FOR EACH ROW EXECUTE FUNCTION heliobay_immutable_record();
