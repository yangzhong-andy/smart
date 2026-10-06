CREATE TABLE "ShopeeDailyOperationAction" (
    "id" TEXT NOT NULL,
    "shopSettingId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "operationAction" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopeeDailyOperationAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeDailyOperationAction_shopSettingId_date_key"
ON "ShopeeDailyOperationAction"("shopSettingId", "date");

CREATE INDEX "ShopeeDailyOperationAction_date_idx"
ON "ShopeeDailyOperationAction"("date");

ALTER TABLE "ShopeeDailyOperationAction"
ADD CONSTRAINT "ShopeeDailyOperationAction_shopSettingId_fkey"
FOREIGN KEY ("shopSettingId") REFERENCES "ShopeeShopSetting"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
