/**
 * 清理数据库中的 idle 连接
 * 注意：对于 Prisma Accelerate，连接由代理管理，此脚本可能无法直接清理
 */

const { PrismaClient } = require('@prisma/client');

async function cleanupIdleConnections() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🧹 开始清理 idle 连接...\n');
    
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 查找所有 idle 连接（排除当前连接）
    const idleConnections = await prisma.$queryRaw`
      SELECT 
        pid,
        usename,
        application_name,
        client_addr,
        state,
        query_start,
        state_change,
        (now() - state_change)::text as idle_duration
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state = 'idle'
        AND usename = 'prisma_migration'
      ORDER BY state_change ASC
    `;
    
    console.log(`📊 找到 ${idleConnections.length} 个 idle 连接\n`);
    
    if (idleConnections.length === 0) {
      console.log('✅ 没有需要清理的 idle 连接\n');
      return;
    }
    
    // 显示要清理的连接
    console.log('📋 要清理的连接:');
    console.log('-'.repeat(100));
    idleConnections.forEach((conn, i) => {
      console.log(`\n连接 ${i + 1}:`);
      console.log(`  PID: ${conn.pid}`);
      console.log(`  用户: ${conn.usename}`);
      console.log(`  客户端: ${conn.client_addr || 'N/A'}`);
      console.log(`  空闲时间: ${conn.idle_duration || 'N/A'}`);
      console.log(`  状态变更: ${conn.state_change}`);
    });
    
    console.log('\n⚠️  注意：由于使用 Prisma Accelerate，连接由代理管理。');
    console.log('   尝试终止连接可能不会立即生效，建议重启开发服务器。\n');
    
    // 尝试终止连接（对于 Prisma Accelerate 可能无效）
    let terminatedCount = 0;
    let failedCount = 0;
    
    for (const conn of idleConnections) {
      try {
        await prisma.$executeRawUnsafe(`SELECT pg_terminate_backend(${conn.pid})`);
        terminatedCount++;
        console.log(`✅ 已终止连接 PID: ${conn.pid}`);
      } catch (error) {
        failedCount++;
        console.log(`❌ 终止连接 PID: ${conn.pid} 失败: ${error.message}`);
      }
    }
    
    console.log(`\n📊 清理结果:`);
    console.log(`  成功: ${terminatedCount} 个`);
    console.log(`  失败: ${failedCount} 个`);
    
    // 等待一秒后检查剩余连接
    console.log('\n⏳ 等待 2 秒后检查剩余连接...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const remainingConnections = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND state = 'idle'
        AND usename = 'prisma_migration'
    `;
    
    const remainingCount = Number(remainingConnections[0].count);
    console.log(`📊 剩余 idle 连接数: ${remainingCount}`);
    
    if (remainingCount > 0) {
      console.log('\n⚠️  仍有连接未清理，可能原因：');
      console.log('   1. 使用 Prisma Accelerate，连接由代理管理');
      console.log('   2. 连接正在被使用');
      console.log('   3. 权限不足');
      console.log('\n💡 建议：重启开发服务器以清理所有连接\n');
    } else {
      console.log('\n✅ 所有 idle 连接已清理\n');
    }
    
  } catch (error) {
    console.error('❌ 清理连接时出错:', error);
    console.error('\n💡 如果使用 Prisma Accelerate，建议重启开发服务器\n');
  } finally {
    await prisma.$disconnect();
  }
}

// 运行清理
cleanupIdleConnections().catch(console.error);
