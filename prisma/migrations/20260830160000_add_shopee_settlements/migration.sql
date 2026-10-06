CREATE TABLE "ShopeeSettlement" (
    "id" TEXT NOT NULL,
    "shopSettingId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderSn" TEXT NOT NULL,
    "currency" TEXT,
    "buyerTotalAmount" DECIMAL(18,2),
    "orderSellingPrice" DECIMAL(18,2),
    "originalPrice" DECIMAL(18,2),
    "sellerDiscount" DECIMAL(18,2),
    "shopeeDiscount" DECIMAL(18,2),
    "commissionFee" DECIMAL(18,2),
    "netCommissionFee" DECIMAL(18,2),
    "serviceFee" DECIMAL(18,2),
    "netServiceFee" DECIMAL(18,2),
    "sellerTransactionFee" DECIMAL(18,2),
    "amsCommissionFee" DECIMAL(18,2),
    "adsEscrowFee" DECIMAL(18,2),
    "campaignFee" DECIMAL(18,2),
    "actualShippingFee" DECIMAL(18,2),
    "finalShippingFee" DECIMAL(18,2),
    "estimatedShippingFee" DECIMAL(18,2),
    "shopeeShippingRebate" DECIMAL(18,2),
    "reverseShippingFee" DECIMAL(18,2),
    "sellerReturnRefund" DECIMAL(18,2),
    "adjustableRefund" DECIMAL(18,2),
    "withholdingTax" DECIMAL(18,2),
    "escrowAmount" DECIMAL(18,2),
    "escrowAmountAfterAdjust" DECIMAL(18,2),
    "returnOrderSns" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeSettlement_orderId_key" ON "ShopeeSettlement"("orderId");
CREATE UNIQUE INDEX "ShopeeSettlement_shopId_orderSn_key" ON "ShopeeSettlement"("shopId", "orderSn");
CREATE INDEX "ShopeeSettlement_shopSettingId_syncedAt_idx" ON "ShopeeSettlement"("shopSettingId", "syncedAt");
CREATE INDEX "ShopeeSettlement_shopId_orderSn_idx" ON "ShopeeSettlement"("shopId", "orderSn");
CREATE INDEX "ShopeeSettlement_escrowAmount_idx" ON "ShopeeSettlement"("escrowAmount");

ALTER TABLE "ShopeeSettlement" ADD CONSTRAINT "ShopeeSettlement_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeSettlement" ADD CONSTRAINT "ShopeeSettlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopeeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
