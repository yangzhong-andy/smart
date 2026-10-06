ALTER TABLE "ShopeeWalletAccount"
  ADD COLUMN "officialBalanceMode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "officialBalanceCursorAt" TIMESTAMP(3),
  ADD COLUMN "officialBalanceCursorTransactionId" TEXT,
  ADD COLUMN "officialBalanceLastSyncAt" TIMESTAMP(3);
