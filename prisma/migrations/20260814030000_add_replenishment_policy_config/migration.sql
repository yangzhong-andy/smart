CREATE TABLE "ReplenishmentPolicyConfig" (
  "id" TEXT NOT NULL,
  "platform" "Platform" NOT NULL DEFAULT 'TIKTOK',
  "country" TEXT NOT NULL,
  "shopId" TEXT,
  "variantId" TEXT,
  "salesWindowDays" INTEGER NOT NULL DEFAULT 30,
  "targetCoverageDays" INTEGER NOT NULL DEFAULT 45,
  "safetyStockDays" INTEGER NOT NULL DEFAULT 15,
  "supplierLeadTimeDays" INTEGER,
  "domesticCollectionDays" INTEGER NOT NULL DEFAULT 0,
  "oceanTransitDays" INTEGER NOT NULL DEFAULT 0,
  "customsClearanceDays" INTEGER NOT NULL DEFAULT 0,
  "demandMultiplier" DECIMAL(8,4) NOT NULL DEFAULT 1,
  "moqOverride" INTEGER,
  "cartonQtyOverride" INTEGER,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "reason" TEXT,
  "createdBy" TEXT NOT NULL DEFAULT 'system',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplenishmentPolicyConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplenishmentPolicyChange" (
  "id" TEXT NOT NULL,
  "policyId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "changedBy" TEXT NOT NULL DEFAULT 'system',
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplenishmentPolicyChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReplenishmentPolicyConfig_platform_country_shopId_variantId_effectiveFrom_idx"
  ON "ReplenishmentPolicyConfig"("platform", "country", "shopId", "variantId", "effectiveFrom");
CREATE INDEX "ReplenishmentPolicyConfig_variantId_idx" ON "ReplenishmentPolicyConfig"("variantId");
CREATE INDEX "ReplenishmentPolicyConfig_shopId_idx" ON "ReplenishmentPolicyConfig"("shopId");
CREATE INDEX "ReplenishmentPolicyChange_policyId_changedAt_idx"
  ON "ReplenishmentPolicyChange"("policyId", "changedAt");
ALTER TABLE "ReplenishmentPolicyConfig"
  ADD CONSTRAINT "ReplenishmentPolicyConfig_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReplenishmentPolicyChange"
  ADD CONSTRAINT "ReplenishmentPolicyChange_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "ReplenishmentPolicyConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
