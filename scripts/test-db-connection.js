const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('正在测试数据库连接...\n');
    
    // 测试基本连接
    await prisma.$connect();
    console.log('✓ Prisma 连接成功\n');
    
    // 测试查询用户
    const userCount = await prisma.user.count();
    console.log(`✓ 用户表查询成功，共有 ${userCount} 个用户\n`);
    
    // 测试查询部门
    const deptCount = await prisma.department.count();
    console.log(`✓ 部门表查询成功，共有 ${deptCount} 个部门\n`);
    
    // 测试查询管理员用户
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@yourcompany.com' },
      include: { department: true }
    });
    
    if (adminUser) {
      console.log('✓ 管理员用户存在:');
      console.log(`  - ID: ${adminUser.id}`);
      console.log(`  - 邮箱: ${adminUser.email}`);
      console.log(`  - 姓名: ${adminUser.name}`);
      console.log(`  - 角色: ${adminUser.role}`);
      console.log(`  - 部门: ${adminUser.department?.name || '未分配'}`);
      console.log(`  - 是否启用: ${adminUser.isActive}\n`);
    } else {
      console.log('⚠️  管理员用户不存在\n');
    }
    
    console.log('✓ 所有测试通过！');
    
  } catch (error) {
    console.error('✗ 数据库连接失败:');
    console.error('  错误信息:', error.message);
    console.error('  错误代码:', error.code);
    if (error.meta) {
      console.error('  详细信息:', error.meta);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
