CREATE TABLE "Notification" (
  "id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"type" TEXT NOT NULL,"title" TEXT NOT NULL,"message" TEXT NOT NULL,"reference" TEXT,"readAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY("userId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "Notification_userId_type_reference_key" ON "Notification"("userId","type","reference");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId","readAt","createdAt");
