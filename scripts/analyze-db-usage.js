const fs = require('fs');
const path = require('path');

console.log('=== 数据库访问量分析 ===\n');

// 分析文件中的定时器和刷新配置
function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    // 检查 setInterval
    const intervalMatches = content.matchAll(/setInterval\s*\([^,]+,\s*(\d+)\)/g);
    for (const match of intervalMatches) {
      const interval = parseInt(match[1]);
      const seconds = interval / 1000;
      const minutes = seconds / 60;
      
      if (interval < 60000) { // 小于1分钟
        issues.push({
          type: '频繁定时器',
          severity: '高',
          message: `每 ${seconds} 秒执行一次 (${minutes.toFixed(1)} 分钟)`,
          line: content.substring(0, match.index).split('\n').length
        });
      } else if (interval < 300000) { // 小于5分钟
        issues.push({
          type: '定时器',
          severity: '中',
          message: `每 ${minutes.toFixed(1)} 分钟执行一次`,
          line: content.substring(0, match.index).split('\n').length
        });
      }
    }
    
    // 检查 refreshInterval
    const refreshMatches = content.matchAll(/refreshInterval:\s*(\d+)/g);
    for (const match of refreshMatches) {
      const interval = parseInt(match[1]);
      const minutes = interval / 60000;
      
      if (interval < 300000) { // 小于5分钟
        issues.push({
          type: 'SWR刷新间隔',
          severity: '中',
          message: `每 ${minutes.toFixed(1)} 分钟刷新一次`,
          line: content.substring(0, match.index).split('\n').length
        });
      }
    }
    
    // 检查 revalidateOnFocus
    const revalidateMatches = content.matchAll(/revalidateOnFocus:\s*(true)/g);
    if (revalidateMatches) {
      const count = Array.from(revalidateMatches).length;
      if (count > 0) {
        issues.push({
          type: '焦点刷新',
          severity: '中',
          message: `发现 ${count} 处 revalidateOnFocus: true (每次窗口获得焦点都会刷新)`,
          line: 0
        });
      }
    }
    
    return issues;
  } catch (e) {
    return [];
  }
}

// 扫描关键文件
const filesToCheck = [
  'src/app/finance/workbench/page.tsx',
  'src/components/Sidebar.tsx',
  'src/components/GlobalRefresher.tsx',
  'src/app/finance/accounts/page.tsx',
  'src/app/finance/page.tsx',
];

console.log('扫描关键文件...\n');

let totalIssues = 0;
const criticalIssues = [];
const mediumIssues = [];

filesToCheck.forEach(file => {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) {
    const issues = analyzeFile(fullPath);
    if (issues.length > 0) {
      console.log(`\n📄 ${file}:`);
      issues.forEach(issue => {
        console.log(`  [${issue.severity === '高' ? '🔴' : '🟡'}] ${issue.type}: ${issue.message}`);
        if (issue.line > 0) {
          console.log(`     行号: ${issue.line}`);
        }
        totalIssues++;
        
        if (issue.severity === '高') {
          criticalIssues.push({ file, ...issue });
        } else {
          mediumIssues.push({ file, ...issue });
        }
      });
    }
  }
});

console.log('\n=== 问题总结 ===\n');

if (criticalIssues.length > 0) {
  console.log('🔴 严重问题（需要立即修复）:');
  criticalIssues.forEach(issue => {
    console.log(`  - ${issue.file}: ${issue.message}`);
  });
  console.log('');
}

if (mediumIssues.length > 0) {
  console.log('🟡 中等问题（建议优化）:');
  mediumIssues.forEach(issue => {
    console.log(`  - ${issue.file}: ${issue.message}`);
  });
  console.log('');
}

// 计算潜在访问量
console.log('=== 潜在数据库访问量估算 ===\n');

// 假设有10个用户同时在线
const concurrentUsers = 10;

// 财务工作台：每3秒刷新
const workbenchInterval = 3000; // 3秒
const workbenchRequestsPerMinute = (60 / (workbenchInterval / 1000)) * concurrentUsers;
console.log(`财务工作台 (每3秒):`);
console.log(`  - 每分钟: ${workbenchRequestsPerMinute} 次请求`);
console.log(`  - 每小时: ${workbenchRequestsPerMinute * 60} 次请求`);
console.log(`  - 每天: ${workbenchRequestsPerMinute * 60 * 24} 次请求`);

// 侧边栏：每30秒刷新
const sidebarInterval = 30000; // 30秒
const sidebarRequestsPerMinute = (60 / (sidebarInterval / 1000)) * concurrentUsers;
console.log(`\n侧边栏 (每30秒):`);
console.log(`  - 每分钟: ${sidebarRequestsPerMinute} 次请求`);
console.log(`  - 每小时: ${sidebarRequestsPerMinute * 60} 次请求`);

// 全局刷新器：每1小时刷新5个端点
const globalRefreshEndpoints = 5;
const globalRequestsPerHour = globalRefreshEndpoints * concurrentUsers;
console.log(`\n全局刷新器 (每1小时, 5个端点):`);
console.log(`  - 每小时: ${globalRequestsPerHour} 次请求`);

const totalPerHour = (workbenchRequestsPerMinute * 60) + (sidebarRequestsPerMinute * 60) + globalRequestsPerHour;
console.log(`\n📊 总计 (10个并发用户):`);
console.log(`  - 每小时: ${totalPerHour} 次请求`);
console.log(`  - 每天: ${totalPerHour * 24} 次请求`);

console.log('\n=== 优化建议 ===\n');
console.log('1. 财务工作台刷新间隔从3秒改为30秒或更长');
console.log('2. 侧边栏刷新间隔从30秒改为2-5分钟');
console.log('3. 使用 WebSocket 或 Server-Sent Events 替代轮询');
console.log('4. 配置 Prisma 连接池限制');
console.log('5. 减少 revalidateOnFocus 的使用');
console.log('6. 使用 SWR 的 dedupingInterval 避免重复请求\n');
