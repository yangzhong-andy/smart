CREATE TABLE "YytAdvertisingDaily" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "advertiserName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "grossRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costPerOrder" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "roi" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "productImpressions" INTEGER NOT NULL DEFAULT 0,
    "productClicks" INTEGER NOT NULL DEFAULT 0,
    "adConversion" INTEGER NOT NULL DEFAULT 0,
    "adConversionRate" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "diggCount" INTEGER NOT NULL DEFAULT 0,
    "collectCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "productAvgPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "productPieceNum" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "itemNum" INTEGER NOT NULL DEFAULT 0,
    "authorizationDate" DATE,
    "relationName" TEXT,
    "categoryNames" TEXT,
    "rawData" JSONB NOT NULL,
    "sourceRequestId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "YytAdvertisingDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YytAdvertisingDaily_date_advertiserId_key"
  ON "YytAdvertisingDaily"("date", "advertiserId");
CREATE INDEX "YytAdvertisingDaily_date_idx"
  ON "YytAdvertisingDaily"("date");
CREATE INDEX "YytAdvertisingDaily_advertiserId_date_idx"
  ON "YytAdvertisingDaily"("advertiserId", "date");
