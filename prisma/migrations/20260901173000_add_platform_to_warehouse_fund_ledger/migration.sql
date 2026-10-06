ALTER TABLE "WarehouseFundEntry"
  ADD COLUMN "platform" TEXT,
  ADD COLUMN "shopId" TEXT,
  ADD COLUMN "shopName" TEXT,
  ADD COLUMN "countryCode" TEXT;

-- Existing profit-order ledger rows were produced exclusively by TikTok.
-- This is a metadata-only backfill and does not change amounts or balances.
UPDATE "WarehouseFundEntry"
SET "platform" = 'TIKTOK'
WHERE "platform" IS NULL
  AND "sourceType" IN (
    'PROFIT_ORDER_FULFILLMENT',
    'PROFIT_ORDER_FULFILLMENT_REVERSAL'
  );

CREATE INDEX "WarehouseFundEntry_platform_occurredAt_idx"
  ON "WarehouseFundEntry"("platform", "occurredAt");

CREATE INDEX "WarehouseFundEntry_platform_shopId_occurredAt_idx"
  ON "WarehouseFundEntry"("platform", "shopId", "occurredAt");
