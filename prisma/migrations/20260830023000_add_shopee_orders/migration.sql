CREATE TABLE "ShopeeOrder" (
  "id" TEXT NOT NULL,
  "shopSettingId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "orderSn" TEXT NOT NULL,
  "status" TEXT,
  "currency" TEXT,
  "totalAmount" DECIMAL(18,2),
  "estimatedShippingFee" DECIMAL(18,2),
  "actualShippingFee" DECIMAL(18,2),
  "buyerUserId" TEXT,
  "buyerUsername" TEXT,
  "paymentMethod" TEXT,
  "shippingCarrier" TEXT,
  "trackingNumber" TEXT,
  "createTime" TIMESTAMP(3),
  "updateTime" TIMESTAMP(3),
  "payTime" TIMESTAMP(3),
  "shipByDate" TIMESTAMP(3),
  "cancelTime" TIMESTAMP(3),
  "rawData" JSONB NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopeeOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "itemSku" TEXT,
  "modelSku" TEXT,
  "itemName" TEXT,
  "modelName" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "originalPrice" DECIMAL(18,2),
  "discountedPrice" DECIMAL(18,2),
  "promotionType" TEXT,
  "imageUrl" TEXT,
  "rawData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopeeOrderSyncCheckpoint" (
  "id" TEXT NOT NULL,
  "shopSettingId" TEXT NOT NULL,
  "lastSuccessfulFrom" TIMESTAMP(3),
  "lastSuccessfulTo" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'idle',
  "lastError" TEXT,
  "ordersProcessed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeOrderSyncCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeOrder_shopId_orderSn_key" ON "ShopeeOrder"("shopId", "orderSn");
CREATE INDEX "ShopeeOrder_shopSettingId_createTime_idx" ON "ShopeeOrder"("shopSettingId", "createTime");
CREATE INDEX "ShopeeOrder_shopId_status_createTime_idx" ON "ShopeeOrder"("shopId", "status", "createTime");
CREATE INDEX "ShopeeOrder_orderSn_idx" ON "ShopeeOrder"("orderSn");
CREATE INDEX "ShopeeOrder_updateTime_idx" ON "ShopeeOrder"("updateTime");
CREATE UNIQUE INDEX "ShopeeOrderItem_orderId_itemId_modelId_key" ON "ShopeeOrderItem"("orderId", "itemId", "modelId");
CREATE INDEX "ShopeeOrderItem_itemSku_idx" ON "ShopeeOrderItem"("itemSku");
CREATE INDEX "ShopeeOrderItem_modelSku_idx" ON "ShopeeOrderItem"("modelSku");
CREATE UNIQUE INDEX "ShopeeOrderSyncCheckpoint_shopSettingId_key" ON "ShopeeOrderSyncCheckpoint"("shopSettingId");
CREATE INDEX "ShopeeOrderSyncCheckpoint_status_lastAttemptAt_idx" ON "ShopeeOrderSyncCheckpoint"("status", "lastAttemptAt");

ALTER TABLE "ShopeeOrder"
  ADD CONSTRAINT "ShopeeOrder_shopSettingId_fkey"
  FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopeeOrderItem"
  ADD CONSTRAINT "ShopeeOrderItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ShopeeOrder"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShopeeOrderSyncCheckpoint"
  ADD CONSTRAINT "ShopeeOrderSyncCheckpoint_shopSettingId_fkey"
  FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
