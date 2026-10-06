CREATE TABLE "WarehouseStorageRule" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "freeDays" INTEGER NOT NULL DEFAULT 0,
    "dailyRate" DECIMAL(18,6) NOT NULL,
    "rateUnit" TEXT NOT NULL DEFAULT 'CBM_DAY',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarehouseStorageRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WarehouseStorageRule_warehouseId_effectiveFrom_idx"
  ON "WarehouseStorageRule"("warehouseId", "effectiveFrom");
CREATE INDEX "WarehouseStorageRule_enabled_effectiveFrom_idx"
  ON "WarehouseStorageRule"("enabled", "effectiveFrom");
ALTER TABLE "WarehouseStorageRule"
  ADD CONSTRAINT "WarehouseStorageRule_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
