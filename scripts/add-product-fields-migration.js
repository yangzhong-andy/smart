/**
 * 添加产品字段的迁移脚本
 * 添加：报关名（中英文）、默认供应商信息
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addProductFields() {
  console.log('🚀 开始添加产品字段...\n');
  
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 步骤 1: 添加报关名字段
    console.log('📋 步骤 1: 添加报关名字段...');
    
    const customsCNExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'customsNameCN'
      );
    `;
    
    if (!customsCNExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "customsNameCN" TEXT;`);
      console.log('✅ 添加 customsNameCN 字段');
    } else {
      console.log('⚠️  customsNameCN 字段已存在');
    }
    
    const customsENExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'customsNameEN'
      );
    `;
    
    if (!customsENExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "customsNameEN" TEXT;`);
      console.log('✅ 添加 customsNameEN 字段');
    } else {
      console.log('⚠️  customsNameEN 字段已存在');
    }
    
    console.log('✅ 报关名字段添加完成\n');
    
    // 步骤 2: 添加默认供应商字段
    console.log('📋 步骤 2: 添加默认供应商字段...');
    
    const defaultSupplierExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'Product' AND column_name = 'defaultSupplierId'
      );
    `;
    
    if (!defaultSupplierExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "Product" ADD COLUMN "defaultSupplierId" TEXT;`);
      console.log('✅ 添加 defaultSupplierId 字段');
      
      // 创建索引
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Product_defaultSupplierId_idx" ON "Product"("defaultSupplierId");`);
      console.log('✅ 创建索引');
      
      // 添加外键约束
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "Product" 
          ADD CONSTRAINT "Product_defaultSupplierId_fkey" 
          FOREIGN KEY ("defaultSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        `);
        console.log('✅ 添加外键约束');
      } catch (error) {
        console.log('⚠️  外键可能已存在:', error.message);
      }
      
      // 可选：从 ProductSupplier 中迁移默认供应商信息
      console.log('\n📋 步骤 3: 迁移默认供应商信息...');
      try {
        await prisma.$executeRawUnsafe(`
          UPDATE "Product" p
          SET "defaultSupplierId" = (
            SELECT ps."supplierId"
            FROM "ProductSupplier" ps
            WHERE ps."productId" = p.id AND ps."isPrimary" = true
            LIMIT 1
          )
          WHERE "defaultSupplierId" IS NULL;
        `);
        console.log('✅ 默认供应商信息迁移完成');
      } catch (error) {
        console.log('⚠️  迁移默认供应商信息时出错:', error.message);
      }
    } else {
      console.log('⚠️  defaultSupplierId 字段已存在');
    }
    
    console.log('\n✅ 所有字段添加完成！\n');
    console.log('下一步操作：');
    console.log('1. 运行: npx prisma generate');
    console.log('2. 更新 API 路由以支持新字段');
    console.log('3. 更新前端组件以显示新字段\n');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
addProductFields().catch((error) => {
  console.error('迁移失败:', error);
  process.exit(1);
});
