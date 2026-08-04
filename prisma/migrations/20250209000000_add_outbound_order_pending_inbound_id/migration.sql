-- AlterTable
ALTER TABLE "OutboundOrder" ADD COLUMN "pendingInboundId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OutboundOrder_pendingInboundId_key" ON "OutboundOrder"("pendingInboundId");

-- CreateIndex
CREATE INDEX "OutboundOrder_pendingInboundId_idx" ON "OutboundOrder"("pendingInboundId");

-- AddForeignKey
ALTER TABLE "OutboundOrder" ADD CONSTRAINT "OutboundOrder_pendingInboundId_fkey" FOREIGN KEY ("pendingInboundId") REFERENCES "PendingInbound"("id") ON DELETE SET NULL ON UPDATE CASCADE;
