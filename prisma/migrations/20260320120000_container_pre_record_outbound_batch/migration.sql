-- AlterTable: 柜子预录单关联出库批次（从批次面板生成）
ALTER TABLE "ContainerPreRecord" ADD COLUMN IF NOT EXISTS "outboundBatchId" TEXT;
ALTER TABLE "ContainerPreRecord" ADD COLUMN IF NOT EXISTS "outboundOrderId" TEXT;

CREATE INDEX IF NOT EXISTS "ContainerPreRecord_outboundBatchId_idx" ON "ContainerPreRecord"("outboundBatchId");

ALTER TABLE "ContainerPreRecord" DROP CONSTRAINT IF EXISTS "ContainerPreRecord_outboundBatchId_fkey";
ALTER TABLE "ContainerPreRecord" ADD CONSTRAINT "ContainerPreRecord_outboundBatchId_fkey" FOREIGN KEY ("outboundBatchId") REFERENCES "OutboundBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
