ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

CREATE TABLE "ModelUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "therapistId" TEXT,
    "conversationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModelUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelUsage_createdAt_idx" ON "ModelUsage"("createdAt");
CREATE INDEX "ModelUsage_userId_createdAt_idx" ON "ModelUsage"("userId", "createdAt");
CREATE INDEX "ModelUsage_therapistId_createdAt_idx" ON "ModelUsage"("therapistId", "createdAt");
CREATE INDEX "ModelUsage_conversationId_idx" ON "ModelUsage"("conversationId");

ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "TherapistProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModelUsage" ADD CONSTRAINT "ModelUsage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
