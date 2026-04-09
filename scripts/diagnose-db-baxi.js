/**
 * 巴西业务（baxi）数据库连接诊断（不依赖 Prisma 连接，只做网络/配置检查）
 * 用法：node scripts/diagnose-db-baxi.js
 * 依赖：需存在 .env.baxi 且其中 DATABASE_URL 指向 baxi 环境
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;

function loadEnvBaxi() {
  const p = path.join(process.cwd(), '.env.baxi');
  if (!fs.existsSync(p)) {
    console.error('✗ 未找到 .env.baxi，请确认文件存在并配置 DATABASE_URL');
    process.exit(1);
  }
  const content = fs.readFileSync(p, 'utf8');
  const urlMatch = content.match(/DATABASE_URL\s*=\s*["']?([^#"'\s]+)/m);
  if (!urlMatch) {
    console.error('✗ .env.baxi 中未找到有效的 DATABASE_URL');
    process.exit(1);
  }
  return urlMatch[1].trim();
}

function parseDbUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return {
      host: u.hostname,
      port: parseInt(u.port || '5432', 10),
      db: (u.pathname || '/').replace(/^\//, '') || 'postgres',
      user: u.username || '',
      hasSsl: urlStr.includes('sslmode') || u.protocol === 'postgres:',
    };
  } catch (e) {
    return null;
  }
}

function tcpConnect(host, port, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(timeoutMs);
    socket.on('error', (err) => reject(err));
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('连接超时'));
    });
  });
}

async function main() {
  console.log('=== 巴西业务（baxi）数据库连接诊断 ===\n');

  const urlStr = loadEnvBaxi();
  const parsed = parseDbUrl(urlStr);
  if (!parsed) {
    console.error('✗ DATABASE_URL 格式无效');
    process.exit(1);
  }

  console.log('1. 配置解析（已脱敏）:');
  console.log('   主机:', parsed.host);
  console.log('   端口:', parsed.port);
  console.log('   数据库:', parsed.db);
  console.log('   用户:', parsed.user ? parsed.user.substring(0, 4) + '***' : '未指定');
  console.log('   SSL:', parsed.hasSsl ? '是' : '未指定');
  console.log('');

  console.log('2. DNS 解析:');
  try {
    const addresses = await dns.resolve4(parsed.host).catch(() => dns.resolve(parsed.host));
    const list = Array.isArray(addresses) ? addresses : (addresses && addresses.length ? addresses : []);
    if (list.length) {
      console.log('   ✓ 解析成功:', list.slice(0, 3).join(', '));
    } else {
      console.log('   ✗ 无法解析或结果为空');
    }
  } catch (e) {
    console.log('   ✗ DNS 解析失败:', e.message);
    console.log('     可能原因：当前网络无法解析该主机名（如 db.prisma.io 在某些网络不可达）');
  }
  console.log('');

  console.log('3. TCP 连接测试（' + parsed.host + ':' + parsed.port + '）:');
  try {
    await tcpConnect(parsed.host, parsed.port);
    console.log('   ✓ 端口可连通');
  } catch (e) {
    console.log('   ✗ 无法连通:', e.message);
    console.log('');
    console.log('   P1001 常见原因：');
    console.log('   - 当前网络无法访问该主机（公司/家庭防火墙、ISP 限制出站 5432）');
    console.log('   - 数据库服务仅允许特定 IP（需在控制台把本机 IP 加入白名单）');
    console.log('   - 主机名 db.prisma.io 为 Prisma 数据平台，多需在能访问外网或已配置 IP 白名单的环境运行');
    console.log('   - 建议：在能连该库的服务器上执行 npm run db:migrate:baxi');
    process.exit(1);
  }
  console.log('');

  console.log('4. Prisma 连接:');
  console.log('   请在本机执行: npx env-cmd -f .env.baxi prisma db execute --stdin < prisma/migrations/xxx/migration.sql');
  console.log('   或到能访问该数据库的服务器上执行: npm run db:migrate:baxi');
  console.log('');
  console.log('诊断完成。若 TCP 可连通仍报 P1001，请检查 SSL/认证或 Prisma 版本。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
