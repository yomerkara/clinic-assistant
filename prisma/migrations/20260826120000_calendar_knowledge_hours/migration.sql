-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'whatsapp';

-- AlterTable
ALTER TABLE "KnowledgeDocument" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "pendingContent" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "pendingHash" TEXT;
ALTER TABLE "KnowledgeDocument" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistWorkingBlock" (
    "id" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "TherapistWorkingBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_key" ON "CalendarConnection"("userId");

-- CreateIndex
CREATE INDEX "TherapistWorkingBlock_therapistId_weekday_idx" ON "TherapistWorkingBlock"("therapistId", "weekday");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistWorkingBlock" ADD CONSTRAINT "TherapistWorkingBlock_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "TherapistProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
