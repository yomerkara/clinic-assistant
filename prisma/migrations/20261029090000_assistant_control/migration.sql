-- Operator control surface: the assistant can be switched off, and screens or
-- optional behaviour can be toggled without a deploy.
ALTER TABLE "ClinicSettings"
  ADD COLUMN     "assistantEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN     "assistantDisabledAt" TIMESTAMP(3),
  ADD COLUMN     "assistantDisabledBy" TEXT,
  ADD COLUMN     "assistantOffReason" TEXT,
  ADD COLUMN     "featureFlags" JSONB NOT NULL DEFAULT '{}';
