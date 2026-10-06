CREATE TABLE "ShopeeWalletTransaction" (
    "id" TEXT NOT NULL,
    "shopSettingId" TEXT NOT NULL,
    "walletId" TEXT,
    "transactionId" TEXT NOT NULL,
    "status" TEXT,
    "walletType" TEXT,
    "transactionType" TEXT NOT NULL,
    "transactionTabType" TEXT,
    "moneyFlow" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currentBalance" DECIMAL(18,2),
    "transactionFee" DECIMAL(18,2),
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "orderSn" TEXT,
    "refundSn" TEXT,
    "withdrawalType" TEXT,
    "withdrawalId" TEXT,
    "rootWithdrawalId" TEXT,
    "description" TEXT,
    "reason" TEXT,
    "buyerName" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "matchedEntryId" TEXT,
    "raw" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopeeWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeWalletTransaction_shopSettingId_transactionId_key" ON "ShopeeWalletTransaction"("shopSettingId", "transactionId");
CREATE INDEX "ShopeeWalletTransaction_shopSettingId_occurredAt_idx" ON "ShopeeWalletTransaction"("shopSettingId", "occurredAt");
CREATE INDEX "ShopeeWalletTransaction_walletId_occurredAt_idx" ON "ShopeeWalletTransaction"("walletId", "occurredAt");
CREATE INDEX "ShopeeWalletTransaction_orderSn_idx" ON "ShopeeWalletTransaction"("orderSn");
CREATE INDEX "ShopeeWalletTransaction_moneyFlow_occurredAt_idx" ON "ShopeeWalletTransaction"("moneyFlow", "occurredAt");
CREATE INDEX "ShopeeWalletTransaction_matchStatus_occurredAt_idx" ON "ShopeeWalletTransaction"("matchStatus", "occurredAt");
CREATE INDEX "ShopeeWalletTransaction_matchedEntryId_idx" ON "ShopeeWalletTransaction"("matchedEntryId");

ALTER TABLE "ShopeeWalletTransaction" ADD CONSTRAINT "ShopeeWalletTransaction_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletTransaction" ADD CONSTRAINT "ShopeeWalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ShopeeWalletAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletTransaction" ADD CONSTRAINT "ShopeeWalletTransaction_matchedEntryId_fkey" FOREIGN KEY ("matchedEntryId") REFERENCES "ShopeeWalletEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
