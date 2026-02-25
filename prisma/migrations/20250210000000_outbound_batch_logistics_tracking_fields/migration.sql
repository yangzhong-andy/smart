-- AlterTable
ALTER TABLE "OutboundBatch" ADD COLUMN "currentLocation" TEXT;
ALTER TABLE "OutboundBatch" ADD COLUMN "lastEvent" TEXT;
ALTER TABLE "OutboundBatch" ADD COLUMN "lastEventTime" TIMESTAMP(3);
