ALTER TABLE "PaymentTransaction" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'SSLCOMMERZ';
CREATE INDEX "PaymentTransaction_provider_status_idx" ON "PaymentTransaction"("provider", "status");
