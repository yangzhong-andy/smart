-- Keep account corrections auditable without changing the financial facts on the cash-flow row.
CREATE TABLE "CashFlowAccountChangeLog" (
    "id" TEXT NOT NULL,
    "cashFlowId" TEXT NOT NULL,
    "flowDate" TIMESTAMP(3) NOT NULL,
    "flowAmount" DECIMAL(18,2) NOT NULL,
    "flowCurrency" TEXT NOT NULL,
    "flowSummary" TEXT NOT NULL,
    "oldAccountId" TEXT NOT NULL,
    "oldAccountName" TEXT NOT NULL,
    "newAccountId" TEXT NOT NULL,
    "newAccountName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlowAccountChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashFlowAccountChangeLog_cashFlowId_createdAt_idx"
ON "CashFlowAccountChangeLog"("cashFlowId", "createdAt");

CREATE INDEX "CashFlowAccountChangeLog_changedById_createdAt_idx"
ON "CashFlowAccountChangeLog"("changedById", "createdAt");
