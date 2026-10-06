CREATE TABLE "QianchuanConnection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "externalGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categoryId" INTEGER NOT NULL DEFAULT 0,
    "reportType" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QianchuanConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QianchuanConnection_adAccountId_key"
  ON "QianchuanConnection"("adAccountId");
CREATE INDEX "QianchuanConnection_enabled_idx"
  ON "QianchuanConnection"("enabled");

ALTER TABLE "QianchuanConnection"
  ADD CONSTRAINT "QianchuanConnection_adAccountId_fkey"
  FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QianchuanDailyMetric" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(18,2),
    "conversions" INTEGER,
    "attributedRevenue" DECIMAL(18,2),
    "roi" DECIMAL(18,6),
    "adCount" INTEGER,
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QianchuanDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QianchuanDailyMetric_connectionId_date_key"
  ON "QianchuanDailyMetric"("connectionId", "date");
CREATE INDEX "QianchuanDailyMetric_date_idx"
  ON "QianchuanDailyMetric"("date");
CREATE INDEX "QianchuanDailyMetric_connectionId_date_idx"
  ON "QianchuanDailyMetric"("connectionId", "date");

ALTER TABLE "QianchuanDailyMetric"
  ADD CONSTRAINT "QianchuanDailyMetric_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "QianchuanConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
