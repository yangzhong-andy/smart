-- AlterTable
ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "platformAccountId" TEXT;
ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "AdAccount" ADD COLUMN IF NOT EXISTS "storeName" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AdAccount_storeId_fkey'
  ) THEN
    ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AdAccount_storeId_idx" ON "AdAccount"("storeId");
