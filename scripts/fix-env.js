const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

console.log('=== 修复 .env.local 配置 ===\n');

const envLocalPath = path.join(process.cwd(), '.env.local');
let envLocalContent = '';

// 读取现有内容
try {
  envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
} catch (e) {
  console.log('创建新的 .env.local 文件...\n');
}

// 生成强随机 Secret（如果当前太短）
const generateSecret = () => {
  return crypto.randomBytes(32).toString('base64');
};

// 解析现有变量
const envVars = {};
const lines = envLocalContent.split('\n');
const newLines = [];

lines.forEach((line) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const equalIndex = trimmed.indexOf('=');
    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();
    envVars[key] = value;
  }
  // 保留注释和空行
  if (trimmed.startsWith('#') || trimmed === '') {
    newLines.push(line);
  }
});

// 检查并修复 NEXTAUTH_SECRET
if (!envVars.NEXTAUTH_SECRET || envVars.NEXTAUTH_SECRET.length < 32) {
  const newSecret = generateSecret();
  console.log('⚠️  NEXTAUTH_SECRET 太短或未设置，生成新的 Secret...');
  console.log(`   新 Secret: ${newSecret.substring(0, 20)}...\n`);
  envVars.NEXTAUTH_SECRET = newSecret;
} else {
  console.log('✓ NEXTAUTH_SECRET 已存在且长度足够\n');
}

// 确保 DATABASE_URL 存在
if (!envVars.DATABASE_URL) {
  console.log('✗ DATABASE_URL 未设置，请手动添加\n');
} else {
  console.log('✓ DATABASE_URL 已设置\n');
}

// 确保 NEXTAUTH_URL 存在
if (!envVars.NEXTAUTH_URL) {
  envVars.NEXTAUTH_URL = 'http://localhost:3000';
  console.log('⚠️  NEXTAUTH_URL 未设置，使用默认值: http://localhost:3000\n');
} else {
  console.log('✓ NEXTAUTH_URL 已设置\n');
}

// 构建新的 .env.local 内容
let newContent = '';

// 保留 VERCEL 相关变量（如果有）
if (envVars.VERCEL_OIDC_TOKEN) {
  newContent += `# Created by Vercel CLI\n`;
  newContent += `VERCEL_OIDC_TOKEN="${envVars.VERCEL_OIDC_TOKEN}"\n\n`;
}

// 添加关键变量
newContent += `# Database\n`;
newContent += `DATABASE_URL=${envVars.DATABASE_URL || 'your-database-url-here'}\n\n`;

newContent += `# NextAuth Configuration\n`;
newContent += `NEXTAUTH_SECRET=${envVars.NEXTAUTH_SECRET}\n`;
newContent += `NEXTAUTH_URL=${envVars.NEXTAUTH_URL}\n`;

// 写入文件
try {
  fs.writeFileSync(envLocalPath, newContent, 'utf8');
  console.log('✓ .env.local 文件已更新\n');
  console.log('=== 更新后的配置 ===\n');
  console.log(newContent);
  console.log('\n请重启开发服务器以使更改生效！');
} catch (e) {
  console.error('✗ 写入文件失败:', e.message);
  process.exit(1);
}
