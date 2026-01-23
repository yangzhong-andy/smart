/**
 * 修复 skuId 字段删除问题
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixSkuIdColumn() {
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    console.log('📋 删除 PurchaseContractItem 表的旧外键约束...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "PurchaseContractItem" 
        DROP CONSTRAINT IF EXISTS "PurchaseContractItem_skuId_fkey" CASCADE;
      `);
      console.log('✅ 外键约束已删除\n');
    } catch (error) {
      console.log('⚠️  外键可能不存在:', error.message);
    }
    
    console.log('📋 删除 Product 表的 skuId 字段...');
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Product" 
        DROP COLUMN IF EXISTS "skuId" CASCADE;
      `);
      console.log('✅ skuId 字段已删除\n');
    } catch (error) {
      console.log('⚠️  删除失败:', error.message);
    }
    
    console.log('✅ 修复完成！\n');
    
  } catch (error) {
    console.error('❌ 修复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSkuIdColumn();
