ALTER TABLE "TikTokShopSetting"
  ALTER COLUMN "region" SET DEFAULT 'UNSET',
  ADD COLUMN "regionSource" TEXT NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "regionVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "storeId" TEXT;

CREATE UNIQUE INDEX "TikTokShopSetting_storeId_key" ON "TikTokShopSetting"("storeId");
CREATE INDEX "TikTokShopSetting_region_idx" ON "TikTokShopSetting"("region");

ALTER TABLE "TikTokShopSetting"
  ADD CONSTRAINT "TikTokShopSetting_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
