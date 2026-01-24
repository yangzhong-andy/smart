const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function checkUserAuth() {
  try {
    console.log('=== 检查用户认证信息 ===\n');
    
    // 查找管理员用户
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@yourcompany.com' },
      include: { department: true }
    });
    
    if (!adminUser) {
      console.log('✗ 管理员用户不存在！');
      console.log('请运行: npm run db:seed 来创建用户\n');
      process.exit(1);
    }
    
    console.log('✓ 管理员用户存在');
    console.log(`  - ID: ${adminUser.id}`);
    console.log(`  - 邮箱: ${adminUser.email}`);
    console.log(`  - 姓名: ${adminUser.name}`);
    console.log(`  - 角色: ${adminUser.role}`);
    console.log(`  - 部门: ${adminUser.department?.name || '未分配'}`);
    console.log(`  - 是否启用: ${adminUser.isActive}`);
    console.log(`  - 密码哈希: ${adminUser.password.substring(0, 20)}... (${adminUser.password.length} 字符)`);
    console.log('');
    
    // 测试密码验证
    console.log('=== 测试密码验证 ===\n');
    const testPassword = 'admin123456';
    const isPasswordValid = await bcrypt.compare(testPassword, adminUser.password);
    
    if (isPasswordValid) {
      console.log('✓ 密码验证成功');
      console.log(`  - 测试密码: ${testPassword}`);
      console.log('  - 可以使用此密码登录\n');
    } else {
      console.log('✗ 密码验证失败！');
      console.log('  - 测试密码: admin123456');
      console.log('  - 密码哈希可能不正确\n');
      console.log('需要重新设置密码，运行以下命令：');
      console.log('node scripts/reset-admin-password.js\n');
    }
    
    // 检查部门关联
    if (!adminUser.departmentId) {
      console.log('⚠️  警告: 用户未关联部门');
      console.log('这可能导致登录后无法正确跳转\n');
    } else {
      console.log('✓ 用户已关联部门');
      console.log(`  - 部门ID: ${adminUser.departmentId}`);
      console.log(`  - 部门名称: ${adminUser.department?.name || '未知'}\n`);
    }
    
    console.log('=== 检查完成 ===\n');
    console.log('如果密码验证失败，请运行: node scripts/reset-admin-password.js');
    
  } catch (error) {
    console.error('✗ 检查失败:', error.message);
    if (error.code === 'P1001') {
      console.error('数据库连接失败，请检查 DATABASE_URL');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkUserAuth();
