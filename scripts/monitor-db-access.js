/**
 * 数据库访问监控工具
 * 用于追踪和记录所有数据库访问
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

// 统计信息
const stats = {
  queries: [],
  errors: [],
  warnings: [],
  startTime: new Date(),
  queryCount: 0,
  errorCount: 0,
  warningCount: 0,
  byEndpoint: new Map(), // 按 API 端点统计
  byTable: new Map(),    // 按表名统计
  byOperation: new Map(), // 按操作类型统计
};

// 监听查询事件
prisma.$on('query', (e) => {
  stats.queryCount++;
  const queryInfo = {
    timestamp: new Date().toISOString(),
    query: e.query,
    params: e.params,
    duration: e.duration,
    target: e.target,
  };
  
  stats.queries.push(queryInfo);
  
  // 解析查询信息
  const tableMatch = e.query.match(/FROM\s+["`]?(\w+)["`]?/i) || 
                     e.query.match(/INTO\s+["`]?(\w+)["`]?/i) ||
                     e.query.match(/UPDATE\s+["`]?(\w+)["`]?/i);
  const table = tableMatch ? tableMatch[1] : 'unknown';
  
  const operationMatch = e.query.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i);
  const operation = operationMatch ? operationMatch[1].toUpperCase() : 'UNKNOWN';
  
  // 统计
  stats.byTable.set(table, (stats.byTable.get(table) || 0) + 1);
  stats.byOperation.set(operation, (stats.byOperation.get(operation) || 0) + 1);
  
  // 只保留最近 1000 条查询
  if (stats.queries.length > 1000) {
    stats.queries.shift();
  }
  
  // 实时输出（可选）
  if (process.env.REALTIME_LOG === 'true') {
    console.log(`[${new Date().toLocaleTimeString()}] ${operation} ${table} (${e.duration}ms)`);
  }
});

// 监听错误事件
prisma.$on('error', (e) => {
  stats.errorCount++;
  stats.errors.push({
    timestamp: new Date().toISOString(),
    message: e.message,
    target: e.target,
  });
  console.error('[DB Error]', e.message);
});

// 监听警告事件
prisma.$on('warn', (e) => {
  stats.warningCount++;
  stats.warnings.push({
    timestamp: new Date().toISOString(),
    message: e.message,
    target: e.target,
  });
  console.warn('[DB Warn]', e.message);
});

// 定期输出统计报告
function printStats() {
  const duration = (new Date() - stats.startTime) / 1000; // 秒
  const queriesPerSecond = (stats.queryCount / duration).toFixed(2);
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 数据库访问统计报告');
  console.log('='.repeat(80));
  console.log(`⏱️  监控时长: ${duration.toFixed(1)} 秒`);
  console.log(`📈 总查询数: ${stats.queryCount}`);
  console.log(`⚡ 查询频率: ${queriesPerSecond} 次/秒`);
  console.log(`❌ 错误数: ${stats.errorCount}`);
  console.log(`⚠️  警告数: ${stats.warningCount}`);
  
  if (stats.byTable.size > 0) {
    console.log('\n📋 按表统计 (Top 10):');
    const tableStats = Array.from(stats.byTable.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    tableStats.forEach(([table, count]) => {
      console.log(`   ${table.padEnd(30)} ${count} 次`);
    });
  }
  
  if (stats.byOperation.size > 0) {
    console.log('\n🔧 按操作类型统计:');
    const opStats = Array.from(stats.byOperation.entries())
      .sort((a, b) => b[1] - a[1]);
    opStats.forEach(([op, count]) => {
      console.log(`   ${op.padEnd(10)} ${count} 次`);
    });
  }
  
  if (stats.queries.length > 0) {
    console.log('\n📝 最近 5 条查询:');
    stats.queries.slice(-5).forEach((q, i) => {
      const time = new Date(q.timestamp).toLocaleTimeString();
      const table = q.query.match(/FROM\s+["`]?(\w+)["`]?/i)?.[1] || 'unknown';
      console.log(`   ${i + 1}. [${time}] ${table} (${q.duration}ms)`);
    });
  }
  
  console.log('='.repeat(80) + '\n');
}

// 导出统计信息
function getStats() {
  return {
    ...stats,
    duration: (new Date() - stats.startTime) / 1000,
    queriesPerSecond: stats.queryCount / ((new Date() - stats.startTime) / 1000),
    byTable: Object.fromEntries(stats.byTable),
    byOperation: Object.fromEntries(stats.byOperation),
  };
}

// 重置统计
function resetStats() {
  stats.queries = [];
  stats.errors = [];
  stats.warnings = [];
  stats.startTime = new Date();
  stats.queryCount = 0;
  stats.errorCount = 0;
  stats.warningCount = 0;
  stats.byEndpoint.clear();
  stats.byTable.clear();
  stats.byOperation.clear();
  console.log('✅ 统计信息已重置');
}

// 主函数
async function main() {
  console.log('🔍 数据库访问监控已启动...');
  console.log('💡 提示: 按 Ctrl+C 停止监控并查看统计报告\n');
  
  // 每 30 秒输出一次统计
  const interval = setInterval(printStats, 30000);
  
  // 处理退出
  process.on('SIGINT', async () => {
    clearInterval(interval);
    console.log('\n\n🛑 正在停止监控...');
    printStats();
    await prisma.$disconnect();
    process.exit(0);
  });
  
  // 保持进程运行
  process.on('unhandledRejection', (error) => {
    console.error('未处理的错误:', error);
  });
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { prisma, getStats, resetStats, printStats };
