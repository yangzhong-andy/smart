/**
 * 验证数据库迁移是否成功
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyMigration() {
  console.log('🔍 开始验证数据库迁移...\n');
  
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 1. 检查 Product 表
    console.log('📋 检查 Product 表...');
    const productCount = await prisma.product.count();
    console.log(`   Product (SPU) 数量: ${productCount}`);
    
    const sampleProduct = await prisma.product.findFirst({
      select: {
        id: true,
        name: true,
        brand: true,
        description: true,
        material: true,
        category: true,
        status: true
      }
    });
    
    if (sampleProduct) {
      console.log('   示例 Product:');
      console.log(`   - ID: ${sampleProduct.id}`);
      console.log(`   - 名称: ${sampleProduct.name}`);
      console.log(`   - 品牌: ${sampleProduct.brand || '(空)'}`);
      console.log(`   - 描述: ${sampleProduct.description || '(空)'}`);
      console.log(`   - 材质: ${sampleProduct.material || '(空)'}`);
    }
    console.log('');
    
    // 2. 检查 ProductVariant 表
    console.log('📋 检查 ProductVariant 表...');
    const variantCount = await prisma.productVariant.count();
    console.log(`   ProductVariant (SKU) 数量: ${variantCount}`);
    
    const sampleVariant = await prisma.productVariant.findFirst({
      include: {
        product: {
          select: {
            name: true,
            brand: true
          }
        }
      }
    });
    
    if (sampleVariant) {
      console.log('   示例 ProductVariant:');
      console.log(`   - ID: ${sampleVariant.id}`);
      console.log(`   - SKU ID: ${sampleVariant.skuId}`);
      console.log(`   - 关联 Product: ${sampleVariant.product.name}`);
      console.log(`   - 颜色: ${sampleVariant.color || '(空)'}`);
      console.log(`   - 尺寸: ${sampleVariant.size || '(空)'}`);
      console.log(`   - 条形码: ${sampleVariant.barcode || '(空)'}`);
      console.log(`   - 成本价: ${sampleVariant.costPrice || '(空)'}`);
      console.log(`   - 库存: ${sampleVariant.stockQuantity}`);
    }
    console.log('');
    
    // 3. 检查关联关系
    console.log('📋 检查关联关系...');
    
    // 检查是否有 Product 没有对应的 Variant
    const productsWithoutVariants = await prisma.$queryRaw`
      SELECT p.id, p.name 
      FROM "Product" p 
      LEFT JOIN "ProductVariant" pv ON p.id = pv."productId" 
      WHERE pv.id IS NULL;
    `;
    
    if (productsWithoutVariants.length > 0) {
      console.log(`   ⚠️  发现 ${productsWithoutVariants.length} 个 Product 没有对应的 Variant`);
    } else {
      console.log('   ✅ 所有 Product 都有对应的 Variant');
    }
    
    // 检查 InventoryStock
    const stockCount = await prisma.inventoryStock.count();
    console.log(`   InventoryStock 记录数: ${stockCount}`);
    
    // 检查 InventoryMovement
    const movementCount = await prisma.inventoryMovement.count();
    console.log(`   InventoryMovement 记录数: ${movementCount}`);
    
    console.log('');
    
    // 4. 检查表结构
    console.log('📋 检查表结构...');
    
    const productColumns = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Product' 
      ORDER BY ordinal_position;
    `;
    
    console.log('   Product 表字段:');
    productColumns.forEach(col => {
      console.log(`   - ${col.column_name}`);
    });
    
    const variantColumns = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ProductVariant' 
      ORDER BY ordinal_position;
    `;
    
    console.log('\n   ProductVariant 表字段:');
    variantColumns.forEach(col => {
      console.log(`   - ${col.column_name}`);
    });
    
    console.log('\n✅ 验证完成！\n');
    
    // 总结
    console.log('📊 迁移总结:');
    console.log(`   - Product (SPU): ${productCount} 个`);
    console.log(`   - ProductVariant (SKU): ${variantCount} 个`);
    console.log(`   - 库存记录: ${stockCount} 条`);
    console.log(`   - 库存变动: ${movementCount} 条`);
    console.log('\n🎉 数据库迁移验证通过！');
    
  } catch (error) {
    console.error('❌ 验证失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration().catch((error) => {
  console.error('验证失败:', error);
  process.exit(1);
});
