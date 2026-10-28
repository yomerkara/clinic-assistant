ALTER TABLE "ModelUsage" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "tariffVersion" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "billedCostUsd" DECIMAL(18,8),
  ADD COLUMN "pricingSnapshot" JSONB;
