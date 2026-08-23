ALTER TABLE "ProfitSkuMapping"
    ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "notes" TEXT;

CREATE TABLE "WarehouseSkuMapping" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "warehouseSku" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarehouseSkuMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseSkuMappingComponent" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarehouseSkuMappingComponent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseSkuMapping_warehouseId_warehouseSku_key"
    ON "WarehouseSkuMapping"("warehouseId", "warehouseSku");
CREATE INDEX "WarehouseSkuMapping_warehouseId_enabled_idx"
    ON "WarehouseSkuMapping"("warehouseId", "enabled");
CREATE INDEX "WarehouseSkuMapping_warehouseSku_idx"
    ON "WarehouseSkuMapping"("warehouseSku");
CREATE UNIQUE INDEX "WarehouseSkuMappingComponent_mappingId_variantId_key"
    ON "WarehouseSkuMappingComponent"("mappingId", "variantId");
CREATE INDEX "WarehouseSkuMappingComponent_variantId_idx"
    ON "WarehouseSkuMappingComponent"("variantId");

ALTER TABLE "WarehouseSkuMapping"
    ADD CONSTRAINT "WarehouseSkuMapping_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseSkuMappingComponent"
    ADD CONSTRAINT "WarehouseSkuMappingComponent_mappingId_fkey"
    FOREIGN KEY ("mappingId") REFERENCES "WarehouseSkuMapping"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WarehouseSkuMappingComponent"
    ADD CONSTRAINT "WarehouseSkuMappingComponent_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
