/**
 * 检查数据库连接和活动连接数
 * 用于排查是否有其他进程在访问数据库
 */

const { PrismaClient } = require('@prisma/client');

async function checkDatabaseConnections() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 检查数据库连接状态...\n');
    
    // 1. 测试连接
    await prisma.$connect();
    console.log('✅ 数据库连接成功\n');
    
    // 2. 检查活动连接数（PostgreSQL）
    try {
      const connections = await prisma.$queryRaw`
        SELECT 
          pid,
          usename,
          application_name,
          client_addr,
          state,
          query_start,
          state_change,
          wait_event_type,
          wait_event,
          query
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid != pg_backend_pid()
        ORDER BY query_start DESC
      `;
      
      console.log(`📊 当前活动连接数: ${connections.length}\n`);
      
      if (connections.length > 0) {
        console.log('📋 活动连接详情:');
        console.log('-'.repeat(100));
        connections.forEach((conn, i) => {
          console.log(`\n连接 ${i + 1}:`);
          console.log(`  PID: ${conn.pid}`);
          console.log(`  用户: ${conn.usename || 'N/A'}`);
          console.log(`  应用: ${conn.application_name || 'N/A'}`);
          console.log(`  客户端: ${conn.client_addr || 'N/A'}`);
          console.log(`  状态: ${conn.state || 'N/A'}`);
          console.log(`  查询开始: ${conn.query_start || 'N/A'}`);
          console.log(`  等待事件: ${conn.wait_event_type || 'N/A'} - ${conn.wait_event || 'N/A'}`);
          if (conn.query) {
            const queryPreview = conn.query.substring(0, 100);
            console.log(`  查询: ${queryPreview}${conn.query.length > 100 ? '...' : ''}`);
          }
        });
        console.log('\n' + '-'.repeat(100));
      } else {
        console.log('✅ 没有其他活动连接\n');
      }
      
      // 3. 检查数据库大小
      const dbSize = await prisma.$queryRaw`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `;
      console.log(`💾 数据库大小: ${dbSize[0].size}\n`);
      
      // 4. 检查表统计
      const tableStats = await prisma.$queryRaw`
        SELECT 
          schemaname,
          tablename,
          n_live_tup as row_count,
          n_dead_tup as dead_rows,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY n_live_tup DESC
        LIMIT 10
      `;
      
      console.log('📊 表统计 (Top 10):');
      console.log('-'.repeat(100));
      tableStats.forEach((table) => {
        console.log(`${table.tablename.padEnd(30)} 行数: ${table.row_count || 0}`);
      });
      console.log('-'.repeat(100) + '\n');
      
    } catch (error) {
      console.error('❌ 查询连接信息失败:', error.message);
    }
    
    // 5. 检查是否有长时间运行的查询
    try {
      const longQueries = await prisma.$queryRaw`
        SELECT 
          pid,
          now() - pg_stat_activity.query_start AS duration,
          query,
          state
        FROM pg_stat_activity
        WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
          AND state = 'active'
          AND pid != pg_backend_pid()
        ORDER BY duration DESC
      `;
      
      if (longQueries.length > 0) {
        console.log('⚠️  发现长时间运行的查询:');
        longQueries.forEach((q) => {
          console.log(`  PID: ${q.pid}, 持续时间: ${q.duration}, 查询: ${q.query.substring(0, 100)}...`);
        });
        console.log('');
      } else {
        console.log('✅ 没有长时间运行的查询\n');
      }
    } catch (error) {
      console.error('❌ 查询长时间运行查询失败:', error.message);
    }
    
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行检查
checkDatabaseConnections().catch(console.error);
