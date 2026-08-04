const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  // 检查待入库单数据
  const pendingInbound = await prisma.pendingInbound.findMany({
    take: 10,
    include: {
      variant: {
        include: { product: true }
      }
    }
  });
  
  console.log('=== 待入库单数据 ===');
  console.log(JSON.stringify(pendingInbound, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
