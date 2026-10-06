-- Mercado Livre OAuth application and account authorization state.
CREATE TABLE "MercadoLivreAppConfig" (
    "id" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "pkceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreAppConfig_clientId_redirectUri_key"
  ON "MercadoLivreAppConfig"("clientId", "redirectUri");
CREATE INDEX "MercadoLivreAppConfig_status_idx"
  ON "MercadoLivreAppConfig"("status");

CREATE TABLE "MercadoLivreAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT,
    "siteId" TEXT NOT NULL DEFAULT 'MLB',
    "country" TEXT NOT NULL DEFAULT 'BR',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "appConfigId" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpireAt" TIMESTAMP(3),
    "tokenRefreshedAt" TIMESTAMP(3),
    "tokenRefreshFailedAt" TIMESTAMP(3),
    "tokenRefreshFailureCount" INTEGER NOT NULL DEFAULT 0,
    "tokenRefreshError" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastSyncAt" TIMESTAMP(3),
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreAccount_storeId_key" ON "MercadoLivreAccount"("storeId");
CREATE UNIQUE INDEX "MercadoLivreAccount_appConfigId_userId_key" ON "MercadoLivreAccount"("appConfigId", "userId");
CREATE INDEX "MercadoLivreAccount_userId_idx" ON "MercadoLivreAccount"("userId");
CREATE INDEX "MercadoLivreAccount_status_idx" ON "MercadoLivreAccount"("status");

ALTER TABLE "MercadoLivreAccount"
  ADD CONSTRAINT "MercadoLivreAccount_appConfigId_fkey"
  FOREIGN KEY ("appConfigId") REFERENCES "MercadoLivreAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreAccount"
  ADD CONSTRAINT "MercadoLivreAccount_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MercadoLivreOAuthState" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "appConfigId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MercadoLivreOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreOAuthState_state_key" ON "MercadoLivreOAuthState"("state");
CREATE INDEX "MercadoLivreOAuthState_expiresAt_idx" ON "MercadoLivreOAuthState"("expiresAt");
CREATE INDEX "MercadoLivreOAuthState_appConfigId_usedAt_idx" ON "MercadoLivreOAuthState"("appConfigId", "usedAt");

ALTER TABLE "MercadoLivreOAuthState"
  ADD CONSTRAINT "MercadoLivreOAuthState_appConfigId_fkey"
  FOREIGN KEY ("appConfigId") REFERENCES "MercadoLivreAppConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MercadoLivreWebhookLog" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "appConfigId" TEXT,
    "accountId" TEXT,
    "applicationId" TEXT,
    "userId" TEXT,
    "topic" TEXT,
    "resource" TEXT,
    "attempts" INTEGER,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'received',
    "processAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "rawData" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreWebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreWebhookLog_eventKey_key" ON "MercadoLivreWebhookLog"("eventKey");
CREATE INDEX "MercadoLivreWebhookLog_status_receivedAt_idx" ON "MercadoLivreWebhookLog"("status", "receivedAt");
CREATE INDEX "MercadoLivreWebhookLog_userId_topic_idx" ON "MercadoLivreWebhookLog"("userId", "topic");
CREATE INDEX "MercadoLivreWebhookLog_resource_idx" ON "MercadoLivreWebhookLog"("resource");

ALTER TABLE "MercadoLivreWebhookLog"
  ADD CONSTRAINT "MercadoLivreWebhookLog_appConfigId_fkey"
  FOREIGN KEY ("appConfigId") REFERENCES "MercadoLivreAppConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreWebhookLog"
  ADD CONSTRAINT "MercadoLivreWebhookLog_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
