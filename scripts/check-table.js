const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  console.log('🔄 检查 PendingInboundItem 表是否存在...');
  
  try {
    // 尝试查询新表
    const result = await prisma.$queryRaw`SELECT 1 FROM "PendingInboundItem" LIMIT 1`;
    console.log('✅ 表已存在');
  } catch (e) {
    console.log('❌ 表不存在，需要创建');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
