CREATE TABLE "ProfitShopCostRule" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "shopId" TEXT NOT NULL,
    "costType" TEXT NOT NULL,
    "ratePercent" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "fixedPerOrder" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "fixedPerUnit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfitShopCostRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseFulfillmentRule" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "shopId" TEXT,
    "billingUnit" TEXT NOT NULL DEFAULT 'SELLER_UNIT',
    "baseOrderFee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "firstUnitFee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "additionalUnitFee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarehouseFulfillmentRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProfitPlatformFeeTier" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "minOrderAmount" DECIMAL(18,4),
    "maxOrderAmount" DECIMAL(18,4),
    "minInclusive" BOOLEAN NOT NULL DEFAULT true,
    "maxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "platformRatePercent" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "perUnitFee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfitPlatformFeeTier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TikTokOrderFinancial" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderCreateTime" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "revenueAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "feeTaxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shippingCostAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "settlementAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'ESTIMATED',
    "statementIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TikTokOrderFinancial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InfluencerSampleCost" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "influencerId" TEXT,
    "teamName" TEXT,
    "manualShippingCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InfluencerSampleCost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfitShopCostRule_platform_shopId_costType_effectiveFrom_key"
    ON "ProfitShopCostRule"("platform", "shopId", "costType", "effectiveFrom");
CREATE INDEX "ProfitShopCostRule_shopId_costType_effectiveFrom_idx"
    ON "ProfitShopCostRule"("shopId", "costType", "effectiveFrom");
CREATE INDEX "ProfitPlatformFeeTier_ruleId_idx" ON "ProfitPlatformFeeTier"("ruleId");
CREATE INDEX "WarehouseFulfillmentRule_warehouseId_effectiveFrom_idx"
    ON "WarehouseFulfillmentRule"("warehouseId", "effectiveFrom");
CREATE INDEX "WarehouseFulfillmentRule_shopId_effectiveFrom_idx"
    ON "WarehouseFulfillmentRule"("shopId", "effectiveFrom");
CREATE UNIQUE INDEX "TikTokOrderFinancial_orderId_key" ON "TikTokOrderFinancial"("orderId");
CREATE INDEX "TikTokOrderFinancial_shopId_orderCreateTime_idx"
    ON "TikTokOrderFinancial"("shopId", "orderCreateTime");
CREATE INDEX "TikTokOrderFinancial_source_syncedAt_idx"
    ON "TikTokOrderFinancial"("source", "syncedAt");
CREATE UNIQUE INDEX "InfluencerSampleCost_orderId_key" ON "InfluencerSampleCost"("orderId");
CREATE INDEX "InfluencerSampleCost_shopId_idx" ON "InfluencerSampleCost"("shopId");
CREATE INDEX "InfluencerSampleCost_influencerId_idx" ON "InfluencerSampleCost"("influencerId");

ALTER TABLE "WarehouseFulfillmentRule"
    ADD CONSTRAINT "WarehouseFulfillmentRule_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfitPlatformFeeTier"
    ADD CONSTRAINT "ProfitPlatformFeeTier_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "ProfitShopCostRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InfluencerSampleCost"
    ADD CONSTRAINT "InfluencerSampleCost_influencerId_fkey"
    FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
