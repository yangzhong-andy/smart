ALTER TABLE "PurchaseContract"
ADD COLUMN "approvalResult" TEXT;

UPDATE "PurchaseContract"
SET "approvalResult" = CASE
    WHEN "status" = 'CANCELLED' THEN '拒绝'
    ELSE '通过'
END
WHERE "approvedAt" IS NOT NULL;
