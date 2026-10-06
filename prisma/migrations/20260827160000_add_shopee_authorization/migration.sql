-- Shopee Open Platform authorization foundation.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'SHOPEE';

CREATE TABLE "ShopeeAppConfig" (
  "id" TEXT NOT NULL,
  "appName" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "partnerKey" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "testRedirectDomain" TEXT,
  "liveRedirectDomain" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeAppConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopeeAppConfig_partnerId_environment_key" ON "ShopeeAppConfig"("partnerId", "environment");
CREATE INDEX "ShopeeAppConfig_status_idx" ON "ShopeeAppConfig"("status");

CREATE TABLE "ShopeeShopSetting" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "shopName" TEXT,
  "region" TEXT NOT NULL DEFAULT 'BR',
  "currency" TEXT,
  "appConfigId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpireAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'disconnected',
  "lastSyncAt" TIMESTAMP(3),
  "storeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeeShopSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopeeShopSetting_storeId_key" ON "ShopeeShopSetting"("storeId");
CREATE UNIQUE INDEX "ShopeeShopSetting_shopId_appConfigId_key" ON "ShopeeShopSetting"("shopId", "appConfigId");
CREATE INDEX "ShopeeShopSetting_shopId_idx" ON "ShopeeShopSetting"("shopId");
CREATE INDEX "ShopeeShopSetting_status_idx" ON "ShopeeShopSetting"("status");
ALTER TABLE "ShopeeShopSetting" ADD CONSTRAINT "ShopeeShopSetting_appConfigId_fkey" FOREIGN KEY ("appConfigId") REFERENCES "ShopeeAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeShopSetting" ADD CONSTRAINT "ShopeeShopSetting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ShopeeOAuthState" (
  "id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "appConfigId" TEXT NOT NULL,
  "environment" TEXT NOT NULL DEFAULT 'sandbox',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopeeOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopeeOAuthState_state_key" ON "ShopeeOAuthState"("state");
CREATE INDEX "ShopeeOAuthState_expiresAt_idx" ON "ShopeeOAuthState"("expiresAt");
CREATE INDEX "ShopeeOAuthState_appConfigId_usedAt_idx" ON "ShopeeOAuthState"("appConfigId", "usedAt");
ALTER TABLE "ShopeeOAuthState" ADD CONSTRAINT "ShopeeOAuthState_appConfigId_fkey" FOREIGN KEY ("appConfigId") REFERENCES "ShopeeAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
