-- CreateTable
CREATE TABLE "OutboundBatchItem" (
    "id" TEXT NOT NULL,
    "outboundBatchId" TEXT NOT NULL,
    "outboundOrderItemId" TEXT,
    "variantId" TEXT,
    "sku" TEXT NOT NULL,
    "skuName" TEXT,
    "spec" TEXT,
    "qty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundBatchItem_outboundBatchId_idx" ON "OutboundBatchItem"("outboundBatchId");

-- AddForeignKey
ALTER TABLE "OutboundBatchItem" ADD CONSTRAINT "OutboundBatchItem_outboundBatchId_fkey" FOREIGN KEY ("outboundBatchId") REFERENCES "OutboundBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundBatchItem" ADD CONSTRAINT "OutboundBatchItem_outboundOrderItemId_fkey" FOREIGN KEY ("outboundOrderItemId") REFERENCES "OutboundOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "OutboundBatchItem_variantId_idx" ON "OutboundBatchItem"("variantId");

-- AddForeignKey
ALTER TABLE "OutboundBatchItem" ADD CONSTRAINT "OutboundBatchItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ContainerPreRecord" ADD COLUMN "outboundBatchId" TEXT,
ADD COLUMN "outboundOrderId" TEXT;

-- CreateIndex
CREATE INDEX "ContainerPreRecord_outboundBatchId_idx" ON "ContainerPreRecord"("outboundBatchId");

-- CreateIndex
CREATE INDEX "ContainerPreRecord_outboundOrderId_idx" ON "ContainerPreRecord"("outboundOrderId");

-- AddForeignKey
ALTER TABLE "ContainerPreRecord" ADD CONSTRAINT "ContainerPreRecord_outboundBatchId_fkey" FOREIGN KEY ("outboundBatchId") REFERENCES "OutboundBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerPreRecord" ADD CONSTRAINT "ContainerPreRecord_outboundOrderId_fkey" FOREIGN KEY ("outboundOrderId") REFERENCES "OutboundOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
