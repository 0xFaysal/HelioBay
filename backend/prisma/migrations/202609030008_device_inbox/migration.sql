CREATE TABLE "DeviceInbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deviceId" TEXT NOT NULL REFERENCES "Device"("id") ON DELETE CASCADE,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DeviceInbox_createdAt_idx" ON "DeviceInbox"("createdAt");
