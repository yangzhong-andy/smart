const fs = require('fs');
const path = require('path');

console.log('=== 检查环境变量配置 ===\n');

// 检查 .env.local
const envLocalPath = path.join(process.cwd(), '.env.local');
let envLocalContent = '';

try {
  envLocalContent = fs.readFileSync(envLocalPath, 'utf8');
  console.log('✓ .env.local 文件存在\n');
} catch (e) {
  console.error('✗ .env.local 文件不存在或无法读取\n');
  process.exit(1);
}

// 解析环境变量
const envVars = {};
const lines = envLocalContent.split('\n');

lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      envVars[key] = value;
    }
  }
});

// 检查关键变量
console.log('=== 关键环境变量检查 ===\n');

// DATABASE_URL
if (envVars.DATABASE_URL) {
  const dbUrl = envVars.DATABASE_URL;
  console.log('✓ DATABASE_URL: 已设置');
  if (dbUrl.includes('db.prisma.io')) {
    console.log('  → 使用 Prisma 数据库');
  } else if (dbUrl.includes('supabase')) {
    console.log('  ⚠️  使用 Supabase 数据库（可能不是预期的）');
  } else {
    console.log('  → 其他数据库');
  }
  console.log(`  → 长度: ${dbUrl.length} 字符\n`);
} else {
  console.log('✗ DATABASE_URL: 未设置\n');
}

// NEXTAUTH_SECRET
if (envVars.NEXTAUTH_SECRET) {
  const secret = envVars.NEXTAUTH_SECRET;
  console.log('✓ NEXTAUTH_SECRET: 已设置');
  if (secret === 'your-secret-key-change-in-production' || secret.length < 32) {
    console.log('  ⚠️  警告: Secret 太短或使用默认值，建议使用至少 32 字符的随机字符串');
  } else {
    console.log('  → 长度: ' + secret.length + ' 字符（符合要求）');
  }
  console.log(`  → 值: ${secret.substring(0, 20)}...\n`);
} else {
  console.log('✗ NEXTAUTH_SECRET: 未设置\n');
}

// NEXTAUTH_URL
if (envVars.NEXTAUTH_URL) {
  const url = envVars.NEXTAUTH_URL;
  console.log('✓ NEXTAUTH_URL: 已设置');
  console.log(`  → ${url}`);
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    console.log('  ⚠️  警告: URL 格式可能不正确');
  }
  console.log('');
} else {
  console.log('✗ NEXTAUTH_URL: 未设置\n');
}

// 检查是否有 VERCEL 相关变量（可能干扰）
const vercelVars = Object.keys(envVars).filter(k => k.startsWith('VERCEL_'));
if (vercelVars.length > 0) {
  console.log('⚠️  发现 VERCEL 相关变量（这些变量通常用于部署，本地开发可能不需要）：');
  vercelVars.forEach(k => {
    console.log(`  - ${k}`);
  });
  console.log('');
}

// 总结
console.log('=== 配置建议 ===\n');

const issues = [];
if (!envVars.DATABASE_URL) issues.push('缺少 DATABASE_URL');
if (!envVars.NEXTAUTH_SECRET) issues.push('缺少 NEXTAUTH_SECRET');
if (!envVars.NEXTAUTH_URL) issues.push('缺少 NEXTAUTH_URL');

if (envVars.NEXTAUTH_SECRET && envVars.NEXTAUTH_SECRET.length < 32) {
  issues.push('NEXTAUTH_SECRET 太短，建议使用至少 32 字符的随机字符串');
}

if (issues.length === 0) {
  console.log('✓ 所有关键环境变量都已正确配置\n');
} else {
  console.log('⚠️  发现以下问题：\n');
  issues.forEach(issue => console.log(`  - ${issue}`));
  console.log('');
}

console.log('=== 检查完成 ===\n');
