ALTER TABLE "WarehouseFulfillmentRule"
  ADD COLUMN IF NOT EXISTS "useVolumetricWeight" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WarehouseFulfillmentRule"
  ADD COLUMN IF NOT EXISTS "oversizeThresholdCm" DECIMAL(10,2);

ALTER TABLE "WarehouseFulfillmentRule"
  ADD COLUMN IF NOT EXISTS "oversizeFee" DECIMAL(18,4) NOT NULL DEFAULT 0;
