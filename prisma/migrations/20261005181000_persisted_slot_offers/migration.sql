ALTER TABLE "Conversation" ADD COLUMN "offeredSlots" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "offeredAt" TIMESTAMP(3), ADD COLUMN "offeredTherapistId" TEXT;
CREATE INDEX "Message_conversationId_processedAt_createdAt_idx" ON "Message"("conversationId", "processedAt", "createdAt");
UPDATE "Conversation" SET "bookingStage" = 'PENDING_APPROVAL' WHERE EXISTS (SELECT 1 FROM "ActionRequest" WHERE "conversationId" = "Conversation"."id" AND "type" = 'NEW_BOOKING' AND "status" = 'PENDING');
