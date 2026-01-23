/**
 * 完成数据库迁移的剩余步骤
 * 更新外键关系、删除旧字段等
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function completeMigration() {
  console.log('🚀 开始完成数据库迁移...\n');
  
  try {
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 步骤 5: 更新 InventoryStock 表
    console.log('📋 步骤 5: 更新 InventoryStock 表...');
    
    // 检查 variantId 字段是否存在
    const stockVariantIdExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'InventoryStock' AND column_name = 'variantId'
      );
    `;
    
    if (!stockVariantIdExists[0].exists) {
      // 添加 variantId 字段
      await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryStock" ADD COLUMN "variantId" TEXT;`);
      console.log('✅ 添加 variantId 字段');
      
      // 迁移数据：根据 productId 找到对应的 variantId
      await prisma.$executeRawUnsafe(`
        UPDATE "InventoryStock" 
        SET "variantId" = (
          SELECT pv."id" 
          FROM "ProductVariant" pv 
          WHERE pv."productId" = "InventoryStock"."productId"
          LIMIT 1
        )
        WHERE "variantId" IS NULL;
      `);
      console.log('✅ 数据迁移完成');
      
      // 删除旧的唯一约束和索引
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "InventoryStock_productId_location_storeId_key";`);
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "InventoryStock_productId_idx";`);
        console.log('✅ 删除旧索引');
      } catch (error) {
        console.log('⚠️  删除旧索引时出错（可能不存在）:', error.message);
      }
      
      // 删除旧列
      await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryStock" DROP COLUMN IF EXISTS "productId";`);
      console.log('✅ 删除旧 productId 列');
      
      // 添加新的唯一约束和索引
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "InventoryStock_variantId_location_storeId_key" ON "InventoryStock"("variantId", "location", "storeId");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InventoryStock_variantId_idx" ON "InventoryStock"("variantId");`);
      console.log('✅ 创建新索引');
    } else {
      console.log('⚠️  InventoryStock 表已更新，跳过\n');
    }
    
    console.log('✅ InventoryStock 表更新完成\n');
    
    // 步骤 6: 更新 InventoryMovement 表
    console.log('📋 步骤 6: 更新 InventoryMovement 表...');
    
    const movementVariantIdExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'InventoryMovement' AND column_name = 'variantId'
      );
    `;
    
    if (!movementVariantIdExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryMovement" ADD COLUMN "variantId" TEXT;`);
      console.log('✅ 添加 variantId 字段');
      
      await prisma.$executeRawUnsafe(`
        UPDATE "InventoryMovement" 
        SET "variantId" = (
          SELECT pv."id" 
          FROM "ProductVariant" pv 
          WHERE pv."productId" = "InventoryMovement"."productId"
          LIMIT 1
        )
        WHERE "variantId" IS NULL;
      `);
      console.log('✅ 数据迁移完成');
      
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "InventoryMovement_productId_idx";`);
        console.log('✅ 删除旧索引');
      } catch (error) {
        console.log('⚠️  删除旧索引时出错（可能不存在）:', error.message);
      }
      
      await prisma.$executeRawUnsafe(`ALTER TABLE "InventoryMovement" DROP COLUMN IF EXISTS "productId";`);
      console.log('✅ 删除旧 productId 列');
      
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "InventoryMovement_variantId_idx" ON "InventoryMovement"("variantId");`);
      console.log('✅ 创建新索引');
    } else {
      console.log('⚠️  InventoryMovement 表已更新，跳过\n');
    }
    
    console.log('✅ InventoryMovement 表更新完成\n');
    
    // 步骤 7: 更新 PurchaseContractItem 表
    console.log('📋 步骤 7: 更新 PurchaseContractItem 表...');
    
    const contractItemVariantIdExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'PurchaseContractItem' AND column_name = 'variantId'
      );
    `;
    
    if (!contractItemVariantIdExists[0].exists) {
      await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseContractItem" ADD COLUMN "variantId" TEXT;`);
      console.log('✅ 添加 variantId 字段');
      
      // 注意：这里使用 sku 字段来匹配 skuId
      await prisma.$executeRawUnsafe(`
        UPDATE "PurchaseContractItem" 
        SET "variantId" = (
          SELECT pv."id" 
          FROM "ProductVariant" pv 
          WHERE pv."skuId" = "PurchaseContractItem"."sku"
          LIMIT 1
        )
        WHERE "variantId" IS NULL;
      `);
      console.log('✅ 数据迁移完成');
      
      try {
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "PurchaseContractItem_contractId_skuId_key";`);
        await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "PurchaseContractItem_skuId_idx";`);
        console.log('✅ 删除旧索引');
      } catch (error) {
        console.log('⚠️  删除旧索引时出错（可能不存在）:', error.message);
      }
      
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseContractItem_contractId_variantId_key" ON "PurchaseContractItem"("contractId", "variantId");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PurchaseContractItem_variantId_idx" ON "PurchaseContractItem"("variantId");`);
      console.log('✅ 创建新索引');
    } else {
      console.log('⚠️  PurchaseContractItem 表已更新，跳过\n');
    }
    
    console.log('✅ PurchaseContractItem 表更新完成\n');
    
    // 步骤 8: 删除 Product 表中的旧字段
    console.log('📋 步骤 8: 清理 Product 表中的旧字段...');
    
    const fieldsToRemove = [
      'skuId', 'costPrice', 'weightKg', 'lengthCm', 'widthCm', 'heightCm',
      'volumetricDivisor', 'atFactory', 'atDomestic', 'inTransit',
      'platformSkuMapping', 'currency', 'targetRoi'
    ];
    
    for (const field of fieldsToRemove) {
      const fieldExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'Product' AND column_name = ${field}
        );
      `;
      
      if (fieldExists[0].exists) {
        try {
          await prisma.$executeRawUnsafe(`ALTER TABLE "Product" DROP COLUMN IF EXISTS "${field}";`);
          console.log(`✅ 删除 ${field} 字段`);
        } catch (error) {
          console.log(`⚠️  删除 ${field} 字段时出错:`, error.message);
        }
      }
    }
    
    console.log('✅ Product 表清理完成\n');
    
    // 步骤 9: 添加外键约束
    console.log('📋 步骤 9: 添加外键约束...');
    
    try {
      // 检查外键是否已存在
      const fkExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_name = 'ProductVariant_productId_fkey'
        );
      `;
      
      if (!fkExists[0].exists) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "ProductVariant" 
          ADD CONSTRAINT "ProductVariant_productId_fkey" 
          FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `);
        console.log('✅ 添加 ProductVariant.productId 外键');
      }
      
      const stockFkExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_name = 'InventoryStock_variantId_fkey'
        );
      `;
      
      if (!stockFkExists[0].exists) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "InventoryStock" 
          ADD CONSTRAINT "InventoryStock_variantId_fkey" 
          FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `);
        console.log('✅ 添加 InventoryStock.variantId 外键');
      }
      
      const movementFkExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_name = 'InventoryMovement_variantId_fkey'
        );
      `;
      
      if (!movementFkExists[0].exists) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "InventoryMovement" 
          ADD CONSTRAINT "InventoryMovement_variantId_fkey" 
          FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        `);
        console.log('✅ 添加 InventoryMovement.variantId 外键');
      }
      
      const contractItemFkExists = await prisma.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.table_constraints 
          WHERE constraint_name = 'PurchaseContractItem_variantId_fkey'
        );
      `;
      
      if (!contractItemFkExists[0].exists) {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE "PurchaseContractItem" 
          ADD CONSTRAINT "PurchaseContractItem_variantId_fkey" 
          FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        `);
        console.log('✅ 添加 PurchaseContractItem.variantId 外键');
      }
      
    } catch (error) {
      console.log('⚠️  添加外键时出错（可能已存在）:', error.message);
    }
    
    console.log('✅ 外键约束添加完成\n');
    
    console.log('🎉 迁移完成！\n');
    console.log('下一步操作：');
    console.log('1. 运行: npx prisma generate');
    console.log('2. 重启开发服务器: npm run dev');
    console.log('3. 验证功能是否正常\n');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行迁移
completeMigration().catch((error) => {
  console.error('迁移失败:', error);
  process.exit(1);
});
