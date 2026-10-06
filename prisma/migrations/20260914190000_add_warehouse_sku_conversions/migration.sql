CREATE TABLE "WarehouseSkuConversion" (
    "id" TEXT NOT NULL,
    "conversionNo" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "sourceVariantId" TEXT NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "completedQty" INTEGER NOT NULL DEFAULT 0,
    "damagedQty" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feeCurrency" TEXT NOT NULL DEFAULT 'BRL',
    "notes" TEXT,
    "evidence" TEXT,
    "completionNotes" TEXT,
    "createdBy" TEXT,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarehouseSkuConversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseSkuConversionOutput" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantityPerSource" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseSkuConversionOutput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseSkuConversion_conversionNo_key" ON "WarehouseSkuConversion"("conversionNo");
CREATE INDEX "WarehouseSkuConversion_warehouseId_status_idx" ON "WarehouseSkuConversion"("warehouseId", "status");
CREATE INDEX "WarehouseSkuConversion_sourceVariantId_idx" ON "WarehouseSkuConversion"("sourceVariantId");
CREATE INDEX "WarehouseSkuConversion_createdAt_idx" ON "WarehouseSkuConversion"("createdAt");
CREATE UNIQUE INDEX "WarehouseSkuConversionOutput_conversionId_variantId_key" ON "WarehouseSkuConversionOutput"("conversionId", "variantId");
CREATE INDEX "WarehouseSkuConversionOutput_variantId_idx" ON "WarehouseSkuConversionOutput"("variantId");

ALTER TABLE "WarehouseSkuConversion" ADD CONSTRAINT "WarehouseSkuConversion_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseSkuConversion" ADD CONSTRAINT "WarehouseSkuConversion_sourceVariantId_fkey" FOREIGN KEY ("sourceVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseSkuConversionOutput" ADD CONSTRAINT "WarehouseSkuConversionOutput_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "WarehouseSkuConversion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WarehouseSkuConversionOutput" ADD CONSTRAINT "WarehouseSkuConversionOutput_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
