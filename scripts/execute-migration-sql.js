/**
 * 执行迁移 SQL 的辅助脚本
 * 这个脚本会尝试执行迁移 SQL 文件中的关键步骤
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function executeMigration() {
  console.log('🚀 开始执行数据库迁移...\n');
  
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 步骤 1: 检查 ProductVariant 表是否已存在
    console.log('📋 步骤 1: 检查 ProductVariant 表...');
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ProductVariant'
      );
    `;
    
    if (tableExists[0].exists) {
      console.log('⚠️  ProductVariant 表已存在，跳过创建\n');
    } else {
      console.log('📝 创建 ProductVariant 表...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProductVariant" (
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
      `);
      console.log('✅ ProductVariant 表创建成功\n');
    }
    
    // 步骤 2: 添加新字段到 Product 表
    console.log('📋 步骤 2: 更新 Product 表结构...');
    
    // 检查并添加 brand 字段
    const brandExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'brand'
      );
    `;
    
    if (!brandExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "brand" TEXT;`);
      console.log('✅ 添加 brand 字段');
    }
    
    // 检查并添加 description 字段
    const descExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'description'
      );
    `;
    
    if (!descExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "description" TEXT;`);
      console.log('✅ 添加 description 字段');
    }
    
    // 检查并添加 material 字段
    const materialExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'material'
      );
    `;
    
    if (!materialExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "material" TEXT;`);
      console.log('✅ 添加 material 字段');
    }
    
    console.log('✅ Product 表结构更新完成\n');
    
    // 步骤 3: 迁移数据到 ProductVariant
    console.log('📋 步骤 3: 迁移数据到 ProductVariant...');
    
    const variantCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "ProductVariant";
    `;
    
    if (variantCount[0].count > 0) {
      console.log('⚠️  ProductVariant 表已有数据，跳过数据迁移\n');
    } else {
      console.log('📝 开始数据迁移...');
      await prisma.$executeRawUnsafe(`
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
          "id" as "productId",
          "skuId",
          NULL as "color",
          NULL as "size",
          "weightKg",
          NULL as "barcode",
          "costPrice",
          COALESCE("atFactory", 0) + COALESCE("atDomestic", 0) + COALESCE("inTransit", 0) as "stockQuantity",
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
      `);
      console.log('✅ 数据迁移完成\n');
    }
    
    // 步骤 4: 创建索引
    console.log('📋 步骤 4: 创建索引...');
    try {
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_skuId_key" ON "ProductVariant"("skuId");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductVariant_productId_idx" ON "ProductVariant"("productId");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProductVariant_skuId_idx" ON "ProductVariant"("skuId");`);
      console.log('✅ 索引创建完成\n');
    } catch (error) {
      console.log('⚠️  索引可能已存在:', error.message);
    }
    
    console.log('✅ 迁移执行完成！');
    console.log('\n⚠️  重要提示：');
    console.log('1. 请继续执行迁移 SQL 文件中的后续步骤（更新外键、删除旧字段等）');
    console.log('2. 执行完成后，运行: npx prisma generate');
    console.log('3. 重启开发服务器\n');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
executeMigration().catch((error) => {
  console.error('迁移失败:', error);
  process.exit(1);
});
