const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
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
