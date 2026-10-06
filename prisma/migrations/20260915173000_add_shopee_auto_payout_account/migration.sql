ALTER TABLE "ShopeeWalletAccount"
ADD COLUMN IF NOT EXISTS "defaultPayoutBankAccountId" TEXT;

CREATE INDEX IF NOT EXISTS "ShopeeWalletAccount_defaultPayoutBankAccountId_idx"
ON "ShopeeWalletAccount"("defaultPayoutBankAccountId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ShopeeWalletAccount_defaultPayoutBankAccountId_fkey'
  ) THEN
    ALTER TABLE "ShopeeWalletAccount"
    ADD CONSTRAINT "ShopeeWalletAccount_defaultPayoutBankAccountId_fkey"
    FOREIGN KEY ("defaultPayoutBankAccountId") REFERENCES "BankAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
