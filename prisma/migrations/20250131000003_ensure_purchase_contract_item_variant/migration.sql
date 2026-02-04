-- 确保 PurchaseContractItem 表有 variantId 列及外键，与 schema.prisma 一致（支持按变体关联）
-- 若已存在则跳过，可重复执行

-- 1. 添加 variantId 列（若不存在）
ALTER TABLE "PurchaseContractItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

-- 2. 若存在旧唯一约束/索引（基于 sku），可删除（按需，不报错）
DROP INDEX IF EXISTS "PurchaseContractItem_contractId_skuId_key";
DROP INDEX IF EXISTS "PurchaseContractItem_skuId_idx";

-- 3. 创建 variantId 相关索引（若不存在）
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseContractItem_contractId_variantId_key" 
  ON "PurchaseContractItem"("contractId", "variantId");
CREATE INDEX IF NOT EXISTS "PurchaseContractItem_variantId_idx" ON "PurchaseContractItem"("variantId");

-- 4. 添加外键（若不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'PurchaseContractItem_variantId_fkey'
  ) THEN
    ALTER TABLE "PurchaseContractItem" 
    ADD CONSTRAINT "PurchaseContractItem_variantId_fkey" 
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
