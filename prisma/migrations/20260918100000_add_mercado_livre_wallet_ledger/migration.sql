CREATE TABLE "MercadoLivreWalletReport" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalReportId" TEXT,
    "reportId" TEXT,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "beginAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "generatedAt" TIMESTAMP(3),
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "rawData" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreWalletReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MercadoLivreWalletTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "reportId" TEXT,
    "transactionKey" TEXT NOT NULL,
    "sourceId" TEXT,
    "externalReference" TEXT,
    "recordType" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "moneyFlow" TEXT NOT NULL,
    "netCreditAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netDebitAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(18,2),
    "sellerAmount" DECIMAL(18,2),
    "marketplaceFeeAmount" DECIMAL(18,2),
    "shippingFeeAmount" DECIMAL(18,2),
    "taxesAmount" DECIMAL(18,2),
    "couponAmount" DECIMAL(18,2),
    "balanceAmount" DECIMAL(18,2),
    "payoutBankAccount" TEXT,
    "paymentMethodType" TEXT,
    "transactionIntentId" TEXT,
    "externalOrderId" TEXT,
    "packId" TEXT,
    "orderMp" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "cashFlowId" TEXT,
    "rawData" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoLivreWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MercadoLivreWalletReport_accountId_fileName_key" ON "MercadoLivreWalletReport"("accountId", "fileName");
CREATE INDEX "MercadoLivreWalletReport_accountId_generatedAt_idx" ON "MercadoLivreWalletReport"("accountId", "generatedAt");
CREATE INDEX "MercadoLivreWalletReport_status_generatedAt_idx" ON "MercadoLivreWalletReport"("status", "generatedAt");

CREATE UNIQUE INDEX "MercadoLivreWalletTransaction_cashFlowId_key" ON "MercadoLivreWalletTransaction"("cashFlowId");
CREATE UNIQUE INDEX "MercadoLivreWalletTransaction_accountId_transactionKey_key" ON "MercadoLivreWalletTransaction"("accountId", "transactionKey");
CREATE INDEX "MercadoLivreWalletTransaction_accountId_occurredAt_idx" ON "MercadoLivreWalletTransaction"("accountId", "occurredAt");
CREATE INDEX "MercadoLivreWalletTransaction_accountId_businessType_occurredAt_idx" ON "MercadoLivreWalletTransaction"("accountId", "businessType", "occurredAt");
CREATE INDEX "MercadoLivreWalletTransaction_accountId_moneyFlow_occurredAt_idx" ON "MercadoLivreWalletTransaction"("accountId", "moneyFlow", "occurredAt");
CREATE INDEX "MercadoLivreWalletTransaction_accountId_payoutBankAccount_occurredAt_idx" ON "MercadoLivreWalletTransaction"("accountId", "payoutBankAccount", "occurredAt");
CREATE INDEX "MercadoLivreWalletTransaction_sourceId_idx" ON "MercadoLivreWalletTransaction"("sourceId");
CREATE INDEX "MercadoLivreWalletTransaction_externalOrderId_idx" ON "MercadoLivreWalletTransaction"("externalOrderId");
CREATE INDEX "MercadoLivreWalletTransaction_matchStatus_occurredAt_idx" ON "MercadoLivreWalletTransaction"("matchStatus", "occurredAt");
CREATE INDEX "MercadoLivreWalletTransaction_reportId_idx" ON "MercadoLivreWalletTransaction"("reportId");

ALTER TABLE "MercadoLivreWalletReport" ADD CONSTRAINT "MercadoLivreWalletReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreWalletTransaction" ADD CONSTRAINT "MercadoLivreWalletTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MercadoLivreAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreWalletTransaction" ADD CONSTRAINT "MercadoLivreWalletTransaction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MercadoLivreWalletReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MercadoLivreWalletTransaction" ADD CONSTRAINT "MercadoLivreWalletTransaction_cashFlowId_fkey" FOREIGN KEY ("cashFlowId") REFERENCES "CashFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
