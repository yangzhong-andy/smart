CREATE TABLE "ShopeeReturn" (
    "id" TEXT NOT NULL,
    "shopSettingId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "returnSn" TEXT NOT NULL,
    "orderSn" TEXT,
    "orderId" TEXT,
    "status" TEXT,
    "reason" TEXT,
    "textReason" TEXT,
    "refundAmount" DECIMAL(18,2),
    "amountBeforeDiscount" DECIMAL(18,2),
    "currency" TEXT,
    "trackingNumber" TEXT,
    "needsLogistics" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TIMESTAMP(3),
    "returnShipDueDate" TIMESTAMP(3),
    "returnSellerDueDate" TIMESTAMP(3),
    "negotiationStatus" TEXT,
    "sellerProofStatus" TEXT,
    "sellerCompensationStatus" TEXT,
    "buyerUsername" TEXT,
    "buyerEmail" TEXT,
    "images" JSONB NOT NULL,
    "disputeReasons" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "sourceCreateTime" TIMESTAMP(3),
    "sourceUpdateTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShopeeReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "itemSku" TEXT,
    "modelSku" TEXT,
    "itemName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "itemPrice" DECIMAL(18,2),
    "images" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeReturn_shopId_returnSn_key" ON "ShopeeReturn"("shopId", "returnSn");
CREATE INDEX "ShopeeReturn_shopSettingId_sourceCreateTime_idx" ON "ShopeeReturn"("shopSettingId", "sourceCreateTime");
CREATE INDEX "ShopeeReturn_shopId_status_sourceCreateTime_idx" ON "ShopeeReturn"("shopId", "status", "sourceCreateTime");
CREATE INDEX "ShopeeReturn_orderSn_idx" ON "ShopeeReturn"("orderSn");
CREATE INDEX "ShopeeReturn_sourceUpdateTime_idx" ON "ShopeeReturn"("sourceUpdateTime");
CREATE UNIQUE INDEX "ShopeeReturnItem_returnId_itemId_modelId_key" ON "ShopeeReturnItem"("returnId", "itemId", "modelId");
CREATE INDEX "ShopeeReturnItem_itemSku_idx" ON "ShopeeReturnItem"("itemSku");
CREATE INDEX "ShopeeReturnItem_modelSku_idx" ON "ShopeeReturnItem"("modelSku");

ALTER TABLE "ShopeeReturn" ADD CONSTRAINT "ShopeeReturn_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeReturn" ADD CONSTRAINT "ShopeeReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopeeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopeeReturnItem" ADD CONSTRAINT "ShopeeReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "ShopeeReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
