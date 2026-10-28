CREATE TABLE "CancellationDelivery" (
  "actionId" TEXT NOT NULL PRIMARY KEY,
  "calendarEventId" TEXT,
  "calendarId" TEXT,
  "ownerUserId" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "calendarSyncedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CancellationDelivery_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "ActionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CancellationDelivery_completedAt_nextAttemptAt_idx" ON "CancellationDelivery"("completedAt", "nextAttemptAt");
