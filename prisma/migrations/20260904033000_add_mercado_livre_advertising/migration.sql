CREATE TABLE "MercadoLivreAdvertisingAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL DEFAULT 'PADS',
    "siteId" TEXT NOT NULL DEFAULT 'MLB',
    "advertiserName" TEXT,
    "accountName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreAdvertisingAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreAdvertisingAccount_accountId_advertiserId_productId_key"
  ON "MercadoLivreAdvertisingAccount"("accountId", "advertiserId", "productId");
CREATE INDEX "MercadoLivreAdvertisingAccount_accountId_status_idx"
  ON "MercadoLivreAdvertisingAccount"("accountId", "status");
CREATE INDEX "MercadoLivreAdvertisingAccount_advertiserId_idx"
  ON "MercadoLivreAdvertisingAccount"("advertiserId");

ALTER TABLE "MercadoLivreAdvertisingAccount"
  ADD CONSTRAINT "MercadoLivreAdvertisingAccount_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MercadoLivreAdvertisingDaily" (
    "id" TEXT NOT NULL,
    "advertisingAccountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "prints" INTEGER NOT NULL DEFAULT 0,
    "ctr" DECIMAL(12,8),
    "cost" DECIMAL(18,2),
    "cpc" DECIMAL(18,4),
    "acos" DECIMAL(12,8),
    "roas" DECIMAL(18,6),
    "tacos" DECIMAL(12,8),
    "cvr" DECIMAL(12,8),
    "directAmount" DECIMAL(18,2),
    "indirectAmount" DECIMAL(18,2),
    "totalAmount" DECIMAL(18,2),
    "directUnitsQuantity" INTEGER NOT NULL DEFAULT 0,
    "indirectUnitsQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitsQuantity" INTEGER NOT NULL DEFAULT 0,
    "organicUnitsQuantity" INTEGER NOT NULL DEFAULT 0,
    "advertisingItemsQuantity" INTEGER NOT NULL DEFAULT 0,
    "directItemsQuantity" INTEGER NOT NULL DEFAULT 0,
    "indirectItemsQuantity" INTEGER NOT NULL DEFAULT 0,
    "organicItemsQuantity" INTEGER NOT NULL DEFAULT 0,
    "organicUnitsAmount" DECIMAL(18,2),
    "organicItemsAmount" DECIMAL(18,2),
    "impressionShare" DECIMAL(12,8),
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreAdvertisingDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreAdvertisingDaily_advertisingAccountId_date_key"
  ON "MercadoLivreAdvertisingDaily"("advertisingAccountId", "date");
CREATE INDEX "MercadoLivreAdvertisingDaily_date_idx"
  ON "MercadoLivreAdvertisingDaily"("date");
CREATE INDEX "MercadoLivreAdvertisingDaily_advertisingAccountId_date_idx"
  ON "MercadoLivreAdvertisingDaily"("advertisingAccountId", "date");

ALTER TABLE "MercadoLivreAdvertisingDaily"
  ADD CONSTRAINT "MercadoLivreAdvertisingDaily_advertisingAccountId_fkey"
  FOREIGN KEY ("advertisingAccountId") REFERENCES "MercadoLivreAdvertisingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
