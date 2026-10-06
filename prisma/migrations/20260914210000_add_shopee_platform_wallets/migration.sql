BEGIN;

CREATE TABLE "ShopeeWalletAccount" (
    "id" TEXT NOT NULL,
    "shopSettingId" TEXT NOT NULL,
    "walletType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "autoTopupRate" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "adAccountId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeWalletAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopeeWalletAccount_walletType_check" CHECK ("walletType" IN ('STORE', 'ADVERTISING')),
    CONSTRAINT "ShopeeWalletAccount_balance_check" CHECK ("balance" >= 0),
    CONSTRAINT "ShopeeWalletAccount_pendingBalance_check" CHECK ("pendingBalance" >= 0),
    CONSTRAINT "ShopeeWalletAccount_autoTopupRate_check" CHECK ("autoTopupRate" >= 0 AND "autoTopupRate" <= 1)
);

CREATE TABLE "ShopeeWalletEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "counterpartyWalletId" TEXT,
    "relatedOrderSn" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "details" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopeeWalletEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopeeWalletEntry_amount_check" CHECK ("amount" <> 0)
);

CREATE TABLE "ShopeeWalletWithdrawal" (
    "id" TEXT NOT NULL,
    "shopSettingId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "payoutReference" TEXT,
    "destinationAccountId" TEXT,
    "cashFlowId" TEXT,
    "actualReceivedAmount" DECIMAL(18,2),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeWalletWithdrawal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ShopeeWalletWithdrawal_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "ShopeeWalletWithdrawal_actualReceivedAmount_check" CHECK ("actualReceivedAmount" IS NULL OR "actualReceivedAmount" >= 0),
    CONSTRAINT "ShopeeWalletWithdrawal_status_check" CHECK ("status" IN ('IN_TRANSIT', 'RECEIVED', 'CANCELLED'))
);

CREATE UNIQUE INDEX "ShopeeWalletAccount_shopSettingId_name_key" ON "ShopeeWalletAccount"("shopSettingId", "name");
CREATE UNIQUE INDEX "ShopeeWalletAccount_one_store_wallet_per_shop_key" ON "ShopeeWalletAccount"("shopSettingId") WHERE "walletType" = 'STORE';
CREATE INDEX "ShopeeWalletAccount_shopSettingId_walletType_idx" ON "ShopeeWalletAccount"("shopSettingId", "walletType");
CREATE INDEX "ShopeeWalletAccount_adAccountId_idx" ON "ShopeeWalletAccount"("adAccountId");
CREATE UNIQUE INDEX "ShopeeWalletEntry_walletId_sourceType_sourceId_key" ON "ShopeeWalletEntry"("walletId", "sourceType", "sourceId");
CREATE INDEX "ShopeeWalletEntry_walletId_occurredAt_idx" ON "ShopeeWalletEntry"("walletId", "occurredAt");
CREATE INDEX "ShopeeWalletEntry_sourceType_sourceId_idx" ON "ShopeeWalletEntry"("sourceType", "sourceId");
CREATE INDEX "ShopeeWalletEntry_relatedOrderSn_idx" ON "ShopeeWalletEntry"("relatedOrderSn");
CREATE UNIQUE INDEX "ShopeeWalletWithdrawal_cashFlowId_key" ON "ShopeeWalletWithdrawal"("cashFlowId");
CREATE INDEX "ShopeeWalletWithdrawal_shopSettingId_status_idx" ON "ShopeeWalletWithdrawal"("shopSettingId", "status");
CREATE INDEX "ShopeeWalletWithdrawal_walletId_requestedAt_idx" ON "ShopeeWalletWithdrawal"("walletId", "requestedAt");
CREATE INDEX "ShopeeWalletWithdrawal_destinationAccountId_idx" ON "ShopeeWalletWithdrawal"("destinationAccountId");

ALTER TABLE "ShopeeWalletAccount" ADD CONSTRAINT "ShopeeWalletAccount_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletAccount" ADD CONSTRAINT "ShopeeWalletAccount_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletEntry" ADD CONSTRAINT "ShopeeWalletEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ShopeeWalletAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletWithdrawal" ADD CONSTRAINT "ShopeeWalletWithdrawal_shopSettingId_fkey" FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletWithdrawal" ADD CONSTRAINT "ShopeeWalletWithdrawal_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ShopeeWalletAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletWithdrawal" ADD CONSTRAINT "ShopeeWalletWithdrawal_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShopeeWalletWithdrawal" ADD CONSTRAINT "ShopeeWalletWithdrawal_cashFlowId_fkey" FOREIGN KEY ("cashFlowId") REFERENCES "CashFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
