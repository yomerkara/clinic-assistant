ALTER TABLE "ServiceRequest" ADD COLUMN "progress" TEXT NOT NULL DEFAULT 'NEW', ADD COLUMN "ownerId" TEXT, ADD COLUMN "followUpAt" TIMESTAMP(3), ADD COLUMN "lastCheckedAt" TIMESTAMP(3), ADD COLUMN "lastCheckResult" TEXT;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ConversationRead" ("userId" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "readThroughAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ConversationRead_pkey" PRIMARY KEY ("userId", "conversationId"));
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationRead" ADD CONSTRAINT "ConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
