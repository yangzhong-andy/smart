ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "preferences" JSONB;

ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "restDays" INTEGER NOT NULL DEFAULT 7;

ALTER TABLE "LogisticsCost"
  ADD COLUMN IF NOT EXISTS "uid" TEXT,
  ADD COLUMN IF NOT EXISTS "voucher" TEXT,
  ADD COLUMN IF NOT EXISTS "expenseRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "cashFlowId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LogisticsCost_uid_key"
  ON "LogisticsCost"("uid");
CREATE INDEX IF NOT EXISTS "LogisticsCost_expenseRequestId_idx"
  ON "LogisticsCost"("expenseRequestId");
CREATE INDEX IF NOT EXISTS "LogisticsCost_cashFlowId_idx"
  ON "LogisticsCost"("cashFlowId");
