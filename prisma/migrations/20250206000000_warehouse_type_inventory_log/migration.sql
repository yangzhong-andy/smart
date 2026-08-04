-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('DOMESTIC', 'OVERSEAS');

-- CreateEnum
CREATE TYPE "InventoryLogType" AS ENUM ('IN', 'OUT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "InventoryLogStatus" AS ENUM ('PENDING_INBOUND', 'INBOUNDED', 'IN_TRANSIT', 'ARRIVED');

-- AlterTable: Warehouse 增加 type，默认 DOMESTIC
ALTER TABLE "Warehouse" ADD COLUMN "type" "WarehouseType" NOT NULL DEFAULT 'DOMESTIC';

-- CreateTable: InventoryLog
CREATE TABLE "InventoryLog" (
    "id" TEXT NOT NULL,
    "type" "InventoryLogType" NOT NULL,
    "status" "InventoryLogStatus" NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "warehouseId" TEXT,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "deliveryOrderId" TEXT,
    "relatedOrderNo" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryLog_variantId_idx" ON "InventoryLog"("variantId");
CREATE INDEX "InventoryLog_warehouseId_idx" ON "InventoryLog"("warehouseId");
CREATE INDEX "InventoryLog_deliveryOrderId_idx" ON "InventoryLog"("deliveryOrderId");
CREATE INDEX "InventoryLog_type_idx" ON "InventoryLog"("type");
CREATE INDEX "InventoryLog_status_idx" ON "InventoryLog"("status");
CREATE INDEX "Warehouse_type_idx" ON "Warehouse"("type");

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
