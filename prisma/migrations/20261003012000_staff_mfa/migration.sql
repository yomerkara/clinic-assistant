ALTER TABLE "User" ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
  ADD COLUMN "totpSecretEncrypted" TEXT,
  ADD COLUMN "totpPendingEncrypted" TEXT,
  ADD COLUMN "totpLastCounter" INTEGER,
  ADD COLUMN "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
