CREATE TYPE "BookingStage" AS ENUM ('GREETING','INTAKE','THERAPIST_PREFERENCE','AVAILABILITY','SLOT_SELECTION','PENDING_APPROVAL','CONFIRMED');
ALTER TABLE "Conversation" ADD COLUMN "bookingStage" "BookingStage" NOT NULL DEFAULT 'GREETING';
ALTER TABLE "Message" ADD COLUMN "processedAt" TIMESTAMP(3);
UPDATE "Message" SET "processedAt" = "createdAt";
CREATE TABLE "InboundBuffer" (
 "conversationId" TEXT PRIMARY KEY REFERENCES "Conversation"("id") ON DELETE CASCADE,
 "firstAt" TIMESTAMP(3) NOT NULL,
 "dueAt" TIMESTAMP(3) NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1,
 "leaseToken" TEXT,
 "leaseUntil" TIMESTAMP(3),
 "attempts" INTEGER NOT NULL DEFAULT 0,
 "demoAdminUserId" TEXT
);
CREATE INDEX "InboundBuffer_dueAt_idx" ON "InboundBuffer"("dueAt");
