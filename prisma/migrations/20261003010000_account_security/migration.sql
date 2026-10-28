ALTER TABLE "User" ADD COLUMN "username" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "passwordExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE TABLE "SecurityToken" (
  "id" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "target" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SecurityToken_tokenHash_key" ON "SecurityToken"("tokenHash");
CREATE INDEX "SecurityToken_userId_kind_idx" ON "SecurityToken"("userId", "kind");
CREATE TABLE "AuthRateLimit" ("key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key"));
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
