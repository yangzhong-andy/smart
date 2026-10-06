-- CreateTable
CREATE TABLE "TikTokDailyOperationAction" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "operationAction" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokDailyOperationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TikTokDailyOperationAction_shopId_date_key" ON "TikTokDailyOperationAction"("shopId", "date");

-- CreateIndex
CREATE INDEX "TikTokDailyOperationAction_date_idx" ON "TikTokDailyOperationAction"("date");

-- AddForeignKey
ALTER TABLE "TikTokDailyOperationAction" ADD CONSTRAINT "TikTokDailyOperationAction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "TikTokShopSetting"("shopId") ON DELETE CASCADE ON UPDATE CASCADE;
