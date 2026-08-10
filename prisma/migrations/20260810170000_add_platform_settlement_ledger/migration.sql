ALTER TABLE "TikTokOrderFinancial"
    ADD COLUMN "referralFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN "smartPromotionFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN "actualShippingFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN "fbtFulfillmentFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    ADD COLUMN "transactionCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PlatformSettlementTransaction" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalShopId" TEXT NOT NULL,
    "externalStatementId" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderCreateTime" TIMESTAMP(3),
    "transactionType" TEXT,
    "currency" TEXT NOT NULL,
    "revenueAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "feeTaxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "referralFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "smartPromotionFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shippingCostAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "actualShippingFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "fbtFulfillmentFeeAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "settlementAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSettlementTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSettlementSyncState" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalShopId" TEXT NOT NULL,
    "externalStatementId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expectedCount" INTEGER,
    "syncedCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSettlementSyncState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSettlementTransaction_platform_externalShopId_externalTransactionId_key"
    ON "PlatformSettlementTransaction"("platform", "externalShopId", "externalTransactionId");
CREATE INDEX "PlatformSettlementTransaction_platform_externalShopId_externalStatementId_idx"
    ON "PlatformSettlementTransaction"("platform", "externalShopId", "externalStatementId");
CREATE INDEX "PlatformSettlementTransaction_platform_externalShopId_orderId_idx"
    ON "PlatformSettlementTransaction"("platform", "externalShopId", "orderId");
CREATE INDEX "PlatformSettlementTransaction_orderCreateTime_idx"
    ON "PlatformSettlementTransaction"("orderCreateTime");

CREATE UNIQUE INDEX "PlatformSettlementSyncState_platform_externalShopId_externalStatementId_key"
    ON "PlatformSettlementSyncState"("platform", "externalShopId", "externalStatementId");
CREATE INDEX "PlatformSettlementSyncState_platform_externalShopId_status_idx"
    ON "PlatformSettlementSyncState"("platform", "externalShopId", "status");
CREATE INDEX "PlatformSettlementSyncState_lastSyncedAt_idx"
    ON "PlatformSettlementSyncState"("lastSyncedAt");
