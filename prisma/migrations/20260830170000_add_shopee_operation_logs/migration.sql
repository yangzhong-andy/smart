CREATE TABLE "ShopeeOperationLog" (
  "id" TEXT NOT NULL, "shopSettingId" TEXT NOT NULL, "shopId" TEXT NOT NULL, "orderSn" TEXT NOT NULL,
  "action" TEXT NOT NULL, "status" TEXT NOT NULL, "actorId" TEXT, "actorName" TEXT, "requestData" JSONB NOT NULL,
  "responseData" JSONB, "error" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "ShopeeOperationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopeeOperationLog_shopId_orderSn_createdAt_idx" ON "ShopeeOperationLog"("shopId", "orderSn", "createdAt");
CREATE INDEX "ShopeeOperationLog_status_createdAt_idx" ON "ShopeeOperationLog"("status", "createdAt");
ALTER TABLE "ShopeeOperationLog" ADD CONSTRAINT "ShopeeOperationLog_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
