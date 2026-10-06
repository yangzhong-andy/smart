ALTER TABLE "ShopeeWalletAccount"
  ADD COLUMN "isOfficialTopupTarget" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ShopeeWalletWithdrawal"
  ADD COLUMN "officialTransactionId" TEXT,
  ADD COLUMN "officialWithdrawalId" TEXT,
  ADD COLUMN "platformCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ShopeeWalletWithdrawal_officialTransactionId_key"
  ON "ShopeeWalletWithdrawal"("officialTransactionId");

CREATE INDEX "ShopeeWalletWithdrawal_officialWithdrawalId_idx"
  ON "ShopeeWalletWithdrawal"("officialWithdrawalId");
