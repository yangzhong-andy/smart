-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN IF NOT EXISTS "itemQtys" JSONB;
