CREATE TABLE "ServiceRequest" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
 "messageId" TEXT NOT NULL, "kind" TEXT NOT NULL, "summary" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OPEN', "resolution" TEXT, "resolvedById" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ServiceRequest_messageId_kind_key" ON "ServiceRequest"("messageId", "kind");
CREATE INDEX "ServiceRequest_status_createdAt_idx" ON "ServiceRequest"("status", "createdAt");
