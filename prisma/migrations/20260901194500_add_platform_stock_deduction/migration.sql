CREATE TABLE "PlatformStockActivation" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "activeFrom" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformStockActivation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformStockDeduction" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "sellerSku" TEXT,
  "qty" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'deducted',
  "orderCreateTime" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformStockDeduction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformStockActivation_platform_shopId_key"
  ON "PlatformStockActivation"("platform", "shopId");
CREATE INDEX "PlatformStockActivation_platform_enabled_activeFrom_idx"
  ON "PlatformStockActivation"("platform", "enabled", "activeFrom");

CREATE UNIQUE INDEX "PlatformStockDeduction_platform_orderId_variantId_key"
  ON "PlatformStockDeduction"("platform", "orderId", "variantId");
CREATE INDEX "PlatformStockDeduction_platform_shopId_orderCreateTime_idx"
  ON "PlatformStockDeduction"("platform", "shopId", "orderCreateTime");
CREATE INDEX "PlatformStockDeduction_warehouseId_variantId_status_idx"
  ON "PlatformStockDeduction"("warehouseId", "variantId", "status");
CREATE INDEX "PlatformStockDeduction_orderId_idx"
  ON "PlatformStockDeduction"("orderId");

-- Existing Shopee stock starts at deployment time. Historical orders remain
-- untouched until a separate audited backfill is explicitly approved.
INSERT INTO "PlatformStockActivation" (
  "id", "platform", "shopId", "enabled", "activeFrom", "notes", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'SHOPEE',
  "shopId",
  true,
  CURRENT_TIMESTAMP,
  'Shopee 商品库存从多平台库存功能上线时间开始自动扣减',
  CURRENT_TIMESTAMP
FROM "ShopeeShopSetting"
WHERE "status" = 'active'
ON CONFLICT ("platform", "shopId") DO NOTHING;
