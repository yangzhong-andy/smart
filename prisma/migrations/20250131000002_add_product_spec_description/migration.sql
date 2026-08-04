-- AlterTable: Product 父表增加规格描述（一单多变体合同用）
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "specDescription" TEXT;
