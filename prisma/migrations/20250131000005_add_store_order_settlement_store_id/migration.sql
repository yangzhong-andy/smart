-- AlterTable: add storeId to StoreOrderSettlement
ALTER TABLE "StoreOrderSettlement" ADD COLUMN "storeId" TEXT;

-- CreateIndex
CREATE INDEX "StoreOrderSettlement_storeId_idx" ON "StoreOrderSettlement"("storeId");
