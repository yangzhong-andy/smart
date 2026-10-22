ALTER TABLE "ProfitCalculation"
  ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
  ADD COLUMN "selectionItemId" TEXT,
  ADD COLUMN "inputSnapshot" JSONB;

CREATE TABLE "ProfitSelectionItem" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sellerSku" TEXT,
  "productVariantId" TEXT,
  "purchaseCostCny" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "weightKg" DECIMAL(10,3),
  "targetPriceBrl" DECIMAL(18,2),
  "firstLegCny" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfitSelectionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfitSelectionItem_platform_status_updatedAt_idx" ON "ProfitSelectionItem"("platform", "status", "updatedAt");
CREATE INDEX "ProfitSelectionItem_productVariantId_idx" ON "ProfitSelectionItem"("productVariantId");
CREATE INDEX "ProfitCalculation_platform_createdAt_idx" ON "ProfitCalculation"("platform", "createdAt");
CREATE INDEX "ProfitCalculation_selectionItemId_idx" ON "ProfitCalculation"("selectionItemId");

ALTER TABLE "ProfitSelectionItem" ADD CONSTRAINT "ProfitSelectionItem_productVariantId_fkey"
  FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProfitCalculation" ADD CONSTRAINT "ProfitCalculation_selectionItemId_fkey"
  FOREIGN KEY ("selectionItemId") REFERENCES "ProfitSelectionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
