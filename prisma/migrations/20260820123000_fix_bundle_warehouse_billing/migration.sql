-- Bundle orders are physically split into their internal components.  Keep
-- the warehouse rule aligned with that billing basis and restore the Globe
-- packaging ladder for existing installations.
-- This table was originally introduced through schema synchronization in
-- some 3001 databases, so make the migration self-contained for clean ones.
CREATE TABLE IF NOT EXISTS "WarehouseFulfillmentPackagingFeeTier" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "minWeightKg" DECIMAL(10,3),
  "maxWeightKg" DECIMAL(10,3),
  "minInclusive" BOOLEAN NOT NULL DEFAULT false,
  "maxInclusive" BOOLEAN NOT NULL DEFAULT true,
  "baseFee" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WarehouseFulfillmentPackagingFeeTier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WarehouseFulfillmentPackagingFeeTier_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "WarehouseFulfillmentRule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WarehouseFulfillmentPackagingFeeTier_ruleId_idx"
  ON "WarehouseFulfillmentPackagingFeeTier"("ruleId");

UPDATE "WarehouseFulfillmentRule" AS rule
SET "billingUnit" = 'INTERNAL_COMPONENT'
FROM "Warehouse" AS warehouse
WHERE rule."warehouseId" = warehouse."id"
  AND warehouse."name" ILIKE '%环球盛通%';

DELETE FROM "WarehouseFulfillmentPackagingFeeTier" AS tier
USING "WarehouseFulfillmentRule" AS rule,
      "Warehouse" AS warehouse
WHERE tier."ruleId" = rule."id"
  AND rule."warehouseId" = warehouse."id"
  AND warehouse."name" ILIKE '%环球盛通%';

INSERT INTO "WarehouseFulfillmentPackagingFeeTier"
  ("id", "ruleId", "minWeightKg", "maxWeightKg", "minInclusive", "maxInclusive", "baseFee", "updatedAt")
SELECT md5(rule."id" || ':globe-packaging:' || ladder."minWeightKg" || ':' || ladder."maxWeightKg"),
       rule."id", ladder."minWeightKg", ladder."maxWeightKg",
       false, true, ladder."baseFee", CURRENT_TIMESTAMP
FROM "WarehouseFulfillmentRule" AS rule
JOIN "Warehouse" AS warehouse ON warehouse."id" = rule."warehouseId"
CROSS JOIN (VALUES
  (0::numeric, 3::numeric, 1::numeric),
  (3::numeric, 10::numeric, 10::numeric),
  (10::numeric, 20::numeric, 20::numeric),
  (20::numeric, 50::numeric, 25::numeric)
) AS ladder("minWeightKg", "maxWeightKg", "baseFee")
WHERE warehouse."name" ILIKE '%环球盛通%';
