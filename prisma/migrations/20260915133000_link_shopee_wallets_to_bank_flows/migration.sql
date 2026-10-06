ALTER TABLE "ShopeeWalletEntry"
  ADD COLUMN "bankAccountId" TEXT,
  ADD COLUMN "cashFlowId" TEXT;

CREATE UNIQUE INDEX "ShopeeWalletEntry_cashFlowId_key"
  ON "ShopeeWalletEntry"("cashFlowId");

CREATE INDEX "ShopeeWalletEntry_bankAccountId_idx"
  ON "ShopeeWalletEntry"("bankAccountId");

ALTER TABLE "ShopeeWalletEntry"
  ADD CONSTRAINT "ShopeeWalletEntry_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShopeeWalletEntry"
  ADD CONSTRAINT "ShopeeWalletEntry_cashFlowId_fkey"
  FOREIGN KEY ("cashFlowId") REFERENCES "CashFlow"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
