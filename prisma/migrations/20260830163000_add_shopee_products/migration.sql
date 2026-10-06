CREATE TABLE "ShopeeProduct" (
  "id" TEXT NOT NULL, "shopSettingId" TEXT NOT NULL, "shopId" TEXT NOT NULL, "itemId" TEXT NOT NULL,
  "itemName" TEXT, "itemSku" TEXT, "itemStatus" TEXT, "categoryId" TEXT, "hasModel" BOOLEAN NOT NULL DEFAULT false,
  "currency" TEXT, "originalPrice" DECIMAL(18,2), "currentPrice" DECIMAL(18,2), "availableStock" INTEGER NOT NULL DEFAULT 0,
  "reservedStock" INTEGER NOT NULL DEFAULT 0, "sales" INTEGER NOT NULL DEFAULT 0, "views" INTEGER NOT NULL DEFAULT 0,
  "likes" INTEGER NOT NULL DEFAULT 0, "rating" DECIMAL(8,2), "commentCount" INTEGER NOT NULL DEFAULT 0,
  "weight" DECIMAL(18,3), "packageLength" DECIMAL(18,2), "packageWidth" DECIMAL(18,2), "packageHeight" DECIMAL(18,2),
  "imageUrl" TEXT, "sourceCreateTime" TIMESTAMP(3), "sourceUpdateTime" TIMESTAMP(3), "rawData" JSONB NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ShopeeProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ShopeeProductModel" (
  "id" TEXT NOT NULL, "productId" TEXT NOT NULL, "modelId" TEXT NOT NULL, "modelName" TEXT, "modelSku" TEXT,
  "modelStatus" TEXT, "currency" TEXT, "originalPrice" DECIMAL(18,2), "currentPrice" DECIMAL(18,2),
  "availableStock" INTEGER NOT NULL DEFAULT 0, "reservedStock" INTEGER NOT NULL DEFAULT 0, "weight" DECIMAL(18,3),
  "packageLength" DECIMAL(18,2), "packageWidth" DECIMAL(18,2), "packageHeight" DECIMAL(18,2), "rawData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeProductModel_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopeeProduct_shopId_itemId_key" ON "ShopeeProduct"("shopId", "itemId");
CREATE INDEX "ShopeeProduct_shopSettingId_itemStatus_idx" ON "ShopeeProduct"("shopSettingId", "itemStatus");
CREATE INDEX "ShopeeProduct_itemSku_idx" ON "ShopeeProduct"("itemSku");
CREATE INDEX "ShopeeProduct_sourceUpdateTime_idx" ON "ShopeeProduct"("sourceUpdateTime");
CREATE UNIQUE INDEX "ShopeeProductModel_productId_modelId_key" ON "ShopeeProductModel"("productId", "modelId");
CREATE INDEX "ShopeeProductModel_modelSku_idx" ON "ShopeeProductModel"("modelSku");
ALTER TABLE "ShopeeProduct" ADD CONSTRAINT "ShopeeProduct_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeProductModel" ADD CONSTRAINT "ShopeeProductModel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ShopeeProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
