CREATE TABLE "FaqAnswerCache" (
    "id" TEXT NOT NULL,
    "normalizedQuestion" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "knowledgeDocId" TEXT,
    "knowledgeVersion" INTEGER,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FaqAnswerCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FaqAnswerCache_normalizedQuestion_key"
ON "FaqAnswerCache"("normalizedQuestion");
