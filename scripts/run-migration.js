/**
 * 执行数据库迁移脚本
 * 将 Product 表拆分为 Product (SPU) 和 ProductVariant (SKU)
 * 
 * 使用方法：
 * 1. 确保已停止开发服务器
 * 2. 确保 DATABASE_URL 环境变量已配置
 * 3. 运行: node scripts/run-migration.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runMigration() {
  console.log('🚀 开始执行数据库迁移...\n');
  
  try {
    // 读取 SQL 迁移文件
    const sqlPath = path.join(__dirname, '../prisma/migrations/manual_split_product_to_spu_sku.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    // 将 SQL 语句按分号分割（简单处理，实际应该用更复杂的 SQL 解析器）
    // 注意：这里使用 Prisma 的 $executeRawUnsafe 来执行 SQL
    // 由于 SQL 文件包含多个语句，我们需要分段执行
    
    console.log('📝 读取迁移 SQL 文件...');
    console.log(`文件路径: ${sqlPath}`);
    console.log(`SQL 文件大小: ${sql.length} 字符\n`);
    
    // 检查数据库连接
    console.log('🔌 检查数据库连接...');
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 执行迁移
    console.log('⚙️  执行迁移 SQL...');
    console.log('⚠️  注意：这是一个破坏性更改，请确保已备份数据库！\n');
    
    // 由于 SQL 文件包含多个语句和 DO 块，我们需要使用 $executeRawUnsafe
    // 但 Prisma 的 $executeRawUnsafe 一次只能执行一个语句
    // 所以我们需要手动分割 SQL 语句
    
    // 简单的方法：直接执行整个 SQL（如果数据库支持）
    // 对于 PostgreSQL，可以使用 DO 块，但 Prisma 可能不支持多语句执行
    
    // 更好的方法：使用 psql 或创建迁移脚本
    console.log('❌ 由于 SQL 文件包含复杂的多语句和 DO 块，');
    console.log('   建议使用以下方法之一执行迁移：\n');
    console.log('方法 1: 使用 psql 命令行工具');
    console.log('   psql $DATABASE_URL -f prisma/migrations/manual_split_product_to_spu_sku.sql\n');
    console.log('方法 2: 使用数据库管理工具（如 pgAdmin、DBeaver）');
    console.log('   直接执行 SQL 文件内容\n');
    console.log('方法 3: 使用 Prisma Migrate（推荐）');
    console.log('   1. 停止开发服务器');
    console.log('   2. 运行: npx prisma migrate dev --name split_product_to_spu_sku');
    console.log('   3. 或者手动创建迁移并执行\n');
    
    // 尝试执行一个简单的测试查询
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ 数据库查询测试成功');
    console.log('测试结果:', result);
    
    await prisma.$disconnect();
    console.log('\n✅ 脚本执行完成');
    console.log('⚠️  请按照上述方法之一执行实际的 SQL 迁移');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// 运行迁移
runMigration();
