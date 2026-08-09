CREATE TABLE "ProfitWarehouseSwitchRule" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'TIKTOK',
    "region" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "externalWarehouseId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveOrderId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProfitWarehouseSwitchRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfitWarehouseSwitchRule_platform_shopId_externalWarehouseId_effectiveFrom_key"
    ON "ProfitWarehouseSwitchRule"("platform", "shopId", "externalWarehouseId", "effectiveFrom");

CREATE INDEX "ProfitWarehouseSwitchRule_platform_region_shopId_externalWarehouseId_effectiveFrom_idx"
    ON "ProfitWarehouseSwitchRule"("platform", "region", "shopId", "externalWarehouseId", "effectiveFrom");

CREATE INDEX "ProfitWarehouseSwitchRule_warehouseId_effectiveFrom_idx"
    ON "ProfitWarehouseSwitchRule"("warehouseId", "effectiveFrom");

ALTER TABLE "ProfitWarehouseSwitchRule"
    ADD CONSTRAINT "ProfitWarehouseSwitchRule_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
