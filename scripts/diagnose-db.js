const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('=== 数据库连接诊断 ===\n');
  
  // 1. 检查环境变量
  const dbUrl = process.env.DATABASE_URL;
  console.log('1. 环境变量检查:');
  if (dbUrl) {
    console.log('   ✓ DATABASE_URL 已设置');
    // 解析数据库 URL（不显示完整密码）
    try {
      const url = new URL(dbUrl);
      console.log(`   - 协议: ${url.protocol}`);
      console.log(`   - 主机: ${url.hostname}`);
      console.log(`   - 端口: ${url.port || '默认'}`);
      console.log(`   - 数据库: ${url.pathname.substring(1)}`);
      console.log(`   - 用户: ${url.username || '未指定'}`);
      
      // 检查是否是 Prisma Accelerate
      if (url.hostname.includes('db.prisma.io') || url.hostname.includes('prisma.io')) {
        console.log('   ⚠️  检测到 Prisma Accelerate 连接');
        console.log('   ⚠️  如果连接失败，可能需要：');
        console.log('      1. 检查 Prisma Accelerate 服务状态');
        console.log('      2. 更新为直接的数据库连接字符串');
        console.log('      3. 检查网络连接和防火墙设置');
      }
      
      // 检查是否是 Supabase
      if (url.hostname.includes('supabase')) {
        console.log('   ✓ 检测到 Supabase 连接');
      }
    } catch (e) {
      console.log('   ⚠️  DATABASE_URL 格式可能不正确');
    }
  } else {
    console.log('   ✗ DATABASE_URL 未设置');
    console.log('\n   解决方案：');
    console.log('   请在 .env.local 文件中添加 DATABASE_URL');
    console.log('   格式: DATABASE_URL="postgresql://user:password@host:port/database"');
    process.exit(1);
  }
  
  console.log('\n2. 连接测试:');
  try {
    await prisma.$connect();
    console.log('   ✓ 数据库连接成功！\n');
    
    // 测试查询
    console.log('3. 数据查询测试:');
    try {
      const tableCount = await prisma.$queryRaw`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `;
      const count = Number((tableCount[0] || {}).count || 0);
      console.log(`   ✓ 数据库表数量: ${count}`);
      
      // 检查关键表
      const tables = ['User', 'Product', 'Department', 'Supplier'];
      for (const table of tables) {
        try {
          const model = prisma[table.toLowerCase()];
          if (model) {
            const count = await model.count();
            console.log(`   ✓ ${table} 表: ${count} 条记录`);
          }
        } catch (e) {
          console.log(`   ⚠️  ${table} 表: 无法查询`);
        }
      }
      
      console.log('\n✓ 数据库连接正常，可以正常使用！');
    } catch (queryError) {
      console.log('   ✗ 查询失败:', queryError.message);
    }
    
  } catch (error) {
    console.log('   ✗ 数据库连接失败！\n');
    console.log('   错误信息:', error.message);
    console.log('   错误代码:', error.code || 'N/A');
    
    if (error.meta) {
      console.log('   详细信息:', JSON.stringify(error.meta, null, 2));
    }
    
    console.log('\n=== 可能的解决方案 ===\n');
    
    if (error.message.includes('db.prisma.io') || error.message.includes('Can\'t reach database server')) {
      console.log('1. Prisma Accelerate 连接问题:');
      console.log('   - 检查 Prisma Accelerate 服务是否可用');
      console.log('   - 检查网络连接和防火墙设置');
      console.log('   - 考虑使用直接的数据库连接字符串\n');
    }
    
    if (error.message.includes('authentication') || error.message.includes('password')) {
      console.log('2. 认证问题:');
      console.log('   - 检查数据库用户名和密码是否正确');
      console.log('   - 检查数据库用户是否有访问权限\n');
    }
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      console.log('3. 网络连接问题:');
      console.log('   - 检查数据库服务器是否运行');
      console.log('   - 检查主机地址和端口是否正确');
      console.log('   - 检查防火墙和网络设置\n');
    }
    
    console.log('4. 通用解决方案:');
    console.log('   - 确认 DATABASE_URL 格式正确');
    console.log('   - 格式: postgresql://user:password@host:port/database');
    console.log('   - 如果使用 Supabase，从项目设置中获取连接字符串');
    console.log('   - 如果使用本地 PostgreSQL，确保服务已启动');
    console.log('   - 重启开发服务器: npm run dev\n');
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose().catch(console.error);
