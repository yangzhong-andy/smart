CREATE TYPE "WarehouseFundEntryType" AS ENUM (
    'OPENING_BALANCE',
    'RECHARGE',
    'FULFILLMENT_DEBIT',
    'STORAGE_DEBIT',
    'SERVICE_DEBIT',
    'REFUND',
    'ADJUSTMENT',
    'REVERSAL'
);

ALTER TABLE "StockLog" ADD COLUMN "evidence" TEXT;

CREATE TABLE "WarehouseFundAccount" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDebit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WarehouseFundAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WarehouseFundEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "entryType" "WarehouseFundEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balanceBefore" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "expenseRequestId" TEXT,
    "cashFlowId" TEXT,
    "orderId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WarehouseFundEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WarehouseFundAccount_warehouseId_currency_key"
    ON "WarehouseFundAccount"("warehouseId", "currency");
CREATE INDEX "WarehouseFundAccount_warehouseId_idx"
    ON "WarehouseFundAccount"("warehouseId");
CREATE UNIQUE INDEX "WarehouseFundEntry_sourceType_sourceId_key"
    ON "WarehouseFundEntry"("sourceType", "sourceId");
CREATE INDEX "WarehouseFundEntry_accountId_occurredAt_idx"
    ON "WarehouseFundEntry"("accountId", "occurredAt");
CREATE INDEX "WarehouseFundEntry_warehouseId_currency_occurredAt_idx"
    ON "WarehouseFundEntry"("warehouseId", "currency", "occurredAt");
CREATE INDEX "WarehouseFundEntry_expenseRequestId_idx"
    ON "WarehouseFundEntry"("expenseRequestId");
CREATE INDEX "WarehouseFundEntry_cashFlowId_idx"
    ON "WarehouseFundEntry"("cashFlowId");
CREATE INDEX "WarehouseFundEntry_orderId_idx"
    ON "WarehouseFundEntry"("orderId");

ALTER TABLE "WarehouseFundAccount"
    ADD CONSTRAINT "WarehouseFundAccount_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WarehouseFundEntry"
    ADD CONSTRAINT "WarehouseFundEntry_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "WarehouseFundAccount"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseFundEntry"
    ADD CONSTRAINT "WarehouseFundEntry_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill only confirmed warehouse prepayments. The expense request is the
-- idempotency source, so rerunning application logic cannot credit it twice.
INSERT INTO "WarehouseFundAccount" (
    "id", "warehouseId", "currency", "balance", "totalCredit", "totalDebit", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    er."warehouseId",
    UPPER(er."currency"),
    SUM(ABS(er."amount")),
    SUM(ABS(er."amount")),
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ExpenseRequest" er
JOIN "Warehouse" w ON w."id" = er."warehouseId" AND w."type" = 'OVERSEAS'
WHERE er."status" = 'Paid'
  AND er."paymentFlowId" IS NOT NULL
  AND er."category" = '物流/海外仓一件代发费'
GROUP BY er."warehouseId", UPPER(er."currency")
ON CONFLICT ("warehouseId", "currency") DO NOTHING;

INSERT INTO "WarehouseFundEntry" (
    "id", "accountId", "warehouseId", "currency", "entryType", "amount",
    "balanceBefore", "balanceAfter", "sourceType", "sourceId",
    "expenseRequestId", "cashFlowId", "occurredAt", "notes", "createdBy", "createdAt"
)
SELECT
    gen_random_uuid()::TEXT,
    account."id",
    er."warehouseId",
    UPPER(er."currency"),
    'RECHARGE'::"WarehouseFundEntryType",
    ABS(er."amount"),
    COALESCE(SUM(ABS(er."amount")) OVER (
      PARTITION BY er."warehouseId", UPPER(er."currency")
      ORDER BY COALESCE(er."paidAt", er."date"), er."createdAt", er."id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0),
    SUM(ABS(er."amount")) OVER (
      PARTITION BY er."warehouseId", UPPER(er."currency")
      ORDER BY COALESCE(er."paidAt", er."date"), er."createdAt", er."id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ),
    'EXPENSE_REQUEST',
    er."id",
    er."id",
    er."paymentFlowId",
    COALESCE(er."paidAt", er."date"),
    '历史已付款海外仓预存款迁移',
    COALESCE(er."paidBy", er."createdBy"),
    CURRENT_TIMESTAMP
FROM "ExpenseRequest" er
JOIN "WarehouseFundAccount" account
  ON account."warehouseId" = er."warehouseId"
 AND account."currency" = UPPER(er."currency")
WHERE er."status" = 'Paid'
  AND er."paymentFlowId" IS NOT NULL
  AND er."category" = '物流/海外仓一件代发费'
ON CONFLICT ("sourceType", "sourceId") DO NOTHING;
