const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function resetAdminPassword() {
  try {
    console.log('=== 重置管理员密码 ===\n');
    
    const email = 'admin@yourcompany.com';
    const newPassword = 'admin123456';
    
    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      console.log('✗ 用户不存在，正在创建...\n');
      
      // 查找财经中心部门
      const financeDept = await prisma.department.findFirst({
        where: { name: '财经中心' }
      });
      
      if (!financeDept) {
        console.log('✗ 财经中心部门不存在，请先运行: npm run db:seed');
        process.exit(1);
      }
      
      // 创建用户
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const newUser = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: '老板',
          role: 'SUPER_ADMIN',
          departmentId: financeDept.id,
          isActive: true
        },
        include: { department: true }
      });
      
      console.log('✓ 用户已创建');
      console.log(`  - 邮箱: ${newUser.email}`);
      console.log(`  - 姓名: ${newUser.name}`);
      console.log(`  - 部门: ${newUser.department?.name || '未分配'}`);
      console.log(`  - 密码: ${newPassword}\n`);
      
    } else {
      console.log('✓ 找到用户，正在重置密码...\n');
      
      // 重置密码
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          isActive: true
        }
      });
      
      console.log('✓ 密码已重置');
      console.log(`  - 邮箱: ${user.email}`);
      console.log(`  - 新密码: ${newPassword}\n`);
    }
    
    // 验证密码
    const updatedUser = await prisma.user.findUnique({
      where: { email }
    });
    
    const isValid = await bcrypt.compare(newPassword, updatedUser.password);
    if (isValid) {
      console.log('✓ 密码验证成功，可以使用新密码登录\n');
    } else {
      console.log('✗ 密码验证失败，请检查代码\n');
    }
    
    console.log('=== 完成 ===\n');
    console.log('现在可以使用以下凭据登录：');
    console.log(`  邮箱: ${email}`);
    console.log(`  密码: ${newPassword}\n`);
    
  } catch (error) {
    console.error('✗ 重置失败:', error.message);
    if (error.code === 'P1001') {
      console.error('数据库连接失败，请检查 DATABASE_URL');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

resetAdminPassword();
