-- AlterTable
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "payeeName" TEXT;
ALTER TABLE "ExpenseRequest" ADD COLUMN IF NOT EXISTS "payeeAccount" TEXT;
