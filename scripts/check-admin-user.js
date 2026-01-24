const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('检查管理员用户数据...\n');
  
  // 查找管理员用户
  const adminUser = await prisma.user.findUnique({
    where: { email: 'admin@yourcompany.com' },
    include: {
      department: true
    }
  });
  
  if (!adminUser) {
    console.log('❌ 管理员用户不存在！');
    console.log('请运行: npx prisma db seed');
    return;
  }
  
  console.log('✓ 管理员用户存在');
  console.log(`  ID: ${adminUser.id}`);
  console.log(`  邮箱: ${adminUser.email}`);
  console.log(`  姓名: ${adminUser.name}`);
  console.log(`  角色: ${adminUser.role}`);
  console.log(`  是否启用: ${adminUser.isActive}`);
  console.log(`  部门: ${adminUser.department?.name || '未分配'}`);
  console.log(`  密码哈希: ${adminUser.password.substring(0, 20)}...`);
  console.log('');
  
  // 测试密码验证
  const testPassword = 'admin123456';
  console.log(`测试密码验证: "${testPassword}"`);
  
  try {
    const isValid = await bcrypt.compare(testPassword, adminUser.password);
    if (isValid) {
      console.log('✓ 密码验证成功！');
    } else {
      console.log('❌ 密码验证失败！');
      console.log('');
      console.log('正在重置密码...');
      
      // 重新哈希密码
      const newHashedPassword = await bcrypt.hash(testPassword, 10);
      
      // 更新密码
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { password: newHashedPassword }
      });
      
      console.log('✓ 密码已重置为: admin123456');
      
      // 再次验证
      const isValidAfterReset = await bcrypt.compare(testPassword, newHashedPassword);
      if (isValidAfterReset) {
        console.log('✓ 重置后密码验证成功！');
      } else {
        console.log('❌ 重置后密码验证仍然失败！');
      }
    }
  } catch (error) {
    console.error('密码验证出错:', error);
  }
}

main()
  .catch((e) => {
    console.error('检查失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
