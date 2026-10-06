ALTER TABLE "ShopeeShopSetting"
  ADD COLUMN "tokenRefreshedAt" TIMESTAMP(3),
  ADD COLUMN "tokenRefreshFailedAt" TIMESTAMP(3),
  ADD COLUMN "tokenRefreshFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tokenRefreshError" TEXT;

CREATE TABLE "ShopeeTokenRefreshLog" (
  "id" TEXT NOT NULL,
  "shopSettingId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "previousExpireAt" TIMESTAMP(3),
  "newExpireAt" TIMESTAMP(3),
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopeeTokenRefreshLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShopeeTokenRefreshLog_shopSettingId_createdAt_idx"
  ON "ShopeeTokenRefreshLog"("shopSettingId", "createdAt");

CREATE INDEX "ShopeeTokenRefreshLog_status_createdAt_idx"
  ON "ShopeeTokenRefreshLog"("status", "createdAt");

ALTER TABLE "ShopeeTokenRefreshLog"
  ADD CONSTRAINT "ShopeeTokenRefreshLog_shopSettingId_fkey"
  FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
