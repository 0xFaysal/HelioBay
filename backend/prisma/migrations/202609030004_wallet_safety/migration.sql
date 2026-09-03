-- Only a ledger insertion may change posted funds. PostgreSQL serializes inserts by wallet.
CREATE UNIQUE INDEX one_topup_per_payment ON "WalletLedger" ("paymentId") WHERE kind = 'TOP_UP';
CREATE UNIQUE INDEX one_debit_per_session ON "WalletLedger" ("sessionId") WHERE kind = 'CHARGING_DEBIT';
CREATE UNIQUE INDEX one_reversal_per_entry ON "WalletLedger" ("relatedLedgerId") WHERE kind = 'REVERSAL';
CREATE UNIQUE INDEX one_reservation_event ON "WalletLedger" ("reservationId", kind) WHERE kind IN ('RESERVATION', 'RESERVATION_RELEASE');
ALTER TABLE "WalletLedger" ADD CONSTRAINT ledger_metadata_limit CHECK (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 2048));

CREATE FUNCTION heliobay_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."balanceMinor" <> 0 THEN RAISE EXCEPTION 'Wallet must start at zero' USING ERRCODE = '23514'; END IF;
  ELSIF NEW."balanceMinor" <> OLD."balanceMinor" AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Balance changes require ledger insertion' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER balance_guard BEFORE INSERT OR UPDATE ON "Wallet" FOR EACH ROW EXECUTE FUNCTION heliobay_balance_guard();

CREATE FUNCTION heliobay_post_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE w "Wallet"%ROWTYPE; held bigint; delta bigint; source "WalletLedger"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT w FROM "Wallet" WHERE id = NEW."walletId" FOR UPDATE;
  IF NEW."actorId" IS NULL OR length(NEW.description) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Ledger requires actor and description' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind IN ('TOP_UP','ADMIN_CREDIT','REFUND','DEMO_CREDIT','RESERVATION_RELEASE') AND NEW."amountMinor" <= 0
     OR NEW.kind IN ('CHARGING_DEBIT','ADMIN_DEBIT','RESERVATION') AND NEW."amountMinor" >= 0
     OR NEW."amountMinor" = 0 THEN
    RAISE EXCEPTION 'Invalid ledger sign' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'TOP_UP' AND NOT EXISTS (SELECT 1 FROM "PaymentTransaction" p WHERE p.id = NEW."paymentId" AND p."userId" = w."userId" AND p."amountMinor" = NEW."amountMinor" AND p.status::text IN ('PAID','VERIFIED')) THEN
    RAISE EXCEPTION 'Top-up must match paid payment' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'CHARGING_DEBIT' AND NOT EXISTS (SELECT 1 FROM "ChargingSession" s WHERE s.id = NEW."sessionId" AND s."ownerId" = w."userId") THEN
    RAISE EXCEPTION 'Session owner mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'REVERSAL' THEN
    SELECT * INTO STRICT source FROM "WalletLedger" WHERE id = NEW."relatedLedgerId" AND "walletId" = NEW."walletId";
    IF source.kind IN ('REVERSAL','RESERVATION','RESERVATION_RELEASE') OR NEW."amountMinor" <> -source."amountMinor" THEN
      RAISE EXCEPTION 'Invalid reversal' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.kind IN ('RESERVATION','RESERVATION_RELEASE') AND NOT EXISTS (SELECT 1 FROM "CreditReservation" r WHERE r.id = NEW."reservationId" AND r."walletId" = w.id AND r."amountMinor" = abs(NEW."amountMinor")) THEN
    RAISE EXCEPTION 'Reservation mismatch' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(sum("amountMinor"),0) INTO held FROM "CreditReservation" WHERE "walletId" = w.id AND status = 'HELD';
  delta := CASE WHEN NEW.kind IN ('RESERVATION','RESERVATION_RELEASE') THEN 0 ELSE NEW."amountMinor" END;
  IF w."balanceMinor" + delta < held OR w."balanceMinor" + delta < 0 THEN
    RAISE EXCEPTION 'Insufficient available balance' USING ERRCODE = '23514';
  END IF;
  NEW."balanceAfterMinor" := w."balanceMinor" + delta;
  UPDATE "Wallet" SET "balanceMinor" = NEW."balanceAfterMinor", version = version + 1, "updatedAt" = now() WHERE id = w.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER post_ledger BEFORE INSERT ON "WalletLedger" FOR EACH ROW EXECUTE FUNCTION heliobay_post_ledger();
