ALTER TABLE "ShopeeWalletAccount"
  DROP CONSTRAINT IF EXISTS "ShopeeWalletAccount_balance_check";

ALTER TABLE "ShopeeWalletAccount"
  ADD CONSTRAINT "ShopeeWalletAccount_balance_check"
  CHECK ("walletType" = 'ADVERTISING' OR "balance" >= 0);
