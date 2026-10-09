ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'KWAI';
CREATE TABLE "KwaiAppConfig" (
 "id" TEXT NOT NULL, "appKey" TEXT NOT NULL, "appName" TEXT NOT NULL, "credentials" TEXT NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "KwaiAppConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KwaiAppConfig_appKey_key" ON "KwaiAppConfig"("appKey");
CREATE TABLE "KwaiOAuthState" (
 "id" TEXT NOT NULL, "stateHash" TEXT NOT NULL, "browserHash" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "appId" TEXT NOT NULL, "appRevision" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3),
 CONSTRAINT "KwaiOAuthState_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "KwaiOAuthState_appId_fkey" FOREIGN KEY ("appId") REFERENCES "KwaiAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KwaiOAuthState_stateHash_key" ON "KwaiOAuthState"("stateHash");
CREATE INDEX "KwaiOAuthState_expiresAt_idx" ON "KwaiOAuthState"("expiresAt");
CREATE TABLE "KwaiShopSetting" (
 "id" TEXT NOT NULL, "merchantId" TEXT NOT NULL, "shopName" TEXT NOT NULL, "appId" TEXT NOT NULL,
 "tokenCipher" TEXT NOT NULL, "tokenExpireAt" TIMESTAMP(3) NOT NULL, "refreshExpireAt" TIMESTAMP(3) NOT NULL,
 "scopes" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'active', "storeId" TEXT NOT NULL, "lastReadAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "KwaiShopSetting_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "KwaiShopSetting_appId_fkey" FOREIGN KEY ("appId") REFERENCES "KwaiAppConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "KwaiShopSetting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KwaiShopSetting_merchantId_key" ON "KwaiShopSetting"("merchantId");
CREATE UNIQUE INDEX "KwaiShopSetting_storeId_key" ON "KwaiShopSetting"("storeId");
CREATE TABLE "KwaiRecord" (
 "id" TEXT NOT NULL, "shopId" TEXT NOT NULL, "kind" TEXT NOT NULL, "externalId" TEXT NOT NULL,
 "payload" JSONB NOT NULL, "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "KwaiRecord_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "KwaiRecord_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "KwaiShopSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KwaiRecord_shopId_kind_externalId_key" ON "KwaiRecord"("shopId", "kind", "externalId");
CREATE INDEX "KwaiRecord_shopId_kind_fetchedAt_idx" ON "KwaiRecord"("shopId", "kind", "fetchedAt");
