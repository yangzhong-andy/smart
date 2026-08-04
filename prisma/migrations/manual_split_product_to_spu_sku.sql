-- 迁移脚本：将 Product 表拆分为 Product (SPU) 和 ProductVariant (SKU)
-- 注意：这是一个破坏性更改，执行前请备份数据库

-- 步骤 1: 创建新的 ProductVariant 表
CREATE TABLE IF NOT EXISTS "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,
    "weightKg" DECIMAL(10,3),
    "barcode" TEXT,
    "costPrice" DECIMAL(18,2),
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "targetRoi" DECIMAL(5,2),
    "lengthCm" DECIMAL(10,2),
    "widthCm" DECIMAL(10,2),
    "heightCm" DECIMAL(10,2),
    "volumetricDivisor" INTEGER,
    "atFactory" INTEGER NOT NULL DEFAULT 0,
    "atDomestic" INTEGER NOT NULL DEFAULT 0,
    "inTransit" INTEGER NOT NULL DEFAULT 0,
    "platformSkuMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- 步骤 2: 创建唯一索引和普通索引
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_skuId_key" ON "ProductVariant"("skuId");
CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX IF NOT EXISTS "ProductVariant_skuId_idx" ON "ProductVariant"("skuId");

-- 步骤 3: 为每个现有的 Product 创建一个对应的 Product (SPU) 和 ProductVariant (SKU)
-- 首先，我们需要更新 Product 表结构，添加新字段（brand, description, material）
-- 然后，将现有数据迁移到新的结构

-- 步骤 3.1: 添加新字段到 Product 表（如果不存在）
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'brand') THEN
        ALTER TABLE "Product" ADD COLUMN "brand" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'description') THEN
        ALTER TABLE "Product" ADD COLUMN "description" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'material') THEN
        ALTER TABLE "Product" ADD COLUMN "material" TEXT;
    END IF;
END $$;

-- 步骤 3.2: 为每个现有的 Product 创建对应的 ProductVariant
-- 将现有的 Product 数据迁移到 ProductVariant
INSERT INTO "ProductVariant" (
    "id",
    "productId",
    "skuId",
    "color",
    "size",
    "weightKg",
    "barcode",
    "costPrice",
    "stockQuantity",
    "currency",
    "targetRoi",
    "lengthCm",
    "widthCm",
    "heightCm",
    "volumetricDivisor",
    "atFactory",
    "atDomestic",
    "inTransit",
    "platformSkuMapping",
    "createdAt",
    "updatedAt"
)
SELECT 
    gen_random_uuid()::TEXT as "id",
    "id" as "productId",  -- 使用 Product 的 id 作为 productId
    "skuId",
    NULL as "color",  -- 新字段，默认为 NULL
    NULL as "size",   -- 新字段，默认为 NULL
    "weightKg",
    NULL as "barcode",  -- 新字段，默认为 NULL
    "costPrice",
    COALESCE("atFactory", 0) + COALESCE("atDomestic", 0) + COALESCE("inTransit", 0) as "stockQuantity",  -- 计算总库存
    "currency",
    "targetRoi",
    "lengthCm",
    "widthCm",
    "heightCm",
    "volumetricDivisor",
    COALESCE("atFactory", 0) as "atFactory",
    COALESCE("atDomestic", 0) as "atDomestic",
    COALESCE("inTransit", 0) as "inTransit",
    "platformSkuMapping",
    "createdAt",
    "updatedAt"
FROM "Product";

-- 步骤 4: 更新 InventoryStock 表，将 productId 改为 variantId
-- 首先添加新列
ALTER TABLE "InventoryStock" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

-- 将数据迁移：根据 productId 找到对应的 variantId
UPDATE "InventoryStock" 
SET "variantId" = (
    SELECT pv."id" 
    FROM "ProductVariant" pv 
    WHERE pv."productId" = "InventoryStock"."productId"
    LIMIT 1
)
WHERE "variantId" IS NULL;

-- 删除旧的唯一约束和索引
DROP INDEX IF EXISTS "InventoryStock_productId_location_storeId_key";
DROP INDEX IF EXISTS "InventoryStock_productId_idx";

-- 删除旧列
ALTER TABLE "InventoryStock" DROP COLUMN IF EXISTS "productId";

-- 添加新的唯一约束和索引
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryStock_variantId_location_storeId_key" ON "InventoryStock"("variantId", "location", "storeId");
CREATE INDEX IF NOT EXISTS "InventoryStock_variantId_idx" ON "InventoryStock"("variantId");

-- 步骤 5: 更新 InventoryMovement 表
ALTER TABLE "InventoryMovement" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

UPDATE "InventoryMovement" 
SET "variantId" = (
    SELECT pv."id" 
    FROM "ProductVariant" pv 
    WHERE pv."productId" = "InventoryMovement"."productId"
    LIMIT 1
)
WHERE "variantId" IS NULL;

DROP INDEX IF EXISTS "InventoryMovement_productId_idx";
ALTER TABLE "InventoryMovement" DROP COLUMN IF EXISTS "productId";
CREATE INDEX IF NOT EXISTS "InventoryMovement_variantId_idx" ON "InventoryMovement"("variantId");

-- 步骤 6: 更新 PurchaseContractItem 表
-- 注意：sku 字段保留作为冗余字段（用于显示），variantId 是真正的关联字段
ALTER TABLE "PurchaseContractItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;

UPDATE "PurchaseContractItem" 
SET "variantId" = (
    SELECT pv."id" 
    FROM "ProductVariant" pv 
    WHERE pv."skuId" = "PurchaseContractItem"."sku"
    LIMIT 1
)
WHERE "variantId" IS NULL;

-- 删除旧的唯一约束（基于 skuId），创建新的（基于 variantId）
DROP INDEX IF EXISTS "PurchaseContractItem_contractId_skuId_key";
DROP INDEX IF EXISTS "PurchaseContractItem_skuId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseContractItem_contractId_variantId_key" ON "PurchaseContractItem"("contractId", "variantId");
CREATE INDEX IF NOT EXISTS "PurchaseContractItem_variantId_idx" ON "PurchaseContractItem"("variantId");

-- 步骤 7: 删除 Product 表中不再需要的字段
-- 注意：这些字段的数据已经迁移到 ProductVariant 中
ALTER TABLE "Product" DROP COLUMN IF EXISTS "skuId";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "costPrice";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "weightKg";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "lengthCm";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "widthCm";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "heightCm";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "volumetricDivisor";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "atFactory";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "atDomestic";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "inTransit";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "platformSkuMapping";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "targetRoi";

-- 步骤 8: 添加外键约束
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" 
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryStock" ADD CONSTRAINT "InventoryStock_variantId_fkey" 
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" 
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseContractItem" ADD CONSTRAINT "PurchaseContractItem_variantId_fkey" 
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 完成迁移
-- 注意：执行此脚本后，需要运行 npx prisma generate 重新生成 Prisma Client
