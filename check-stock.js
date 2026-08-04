const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  // 查找这3个 variantId 对应的库存
  const variantIds = [
    'f3f61c84-36ff-4035-85c5-75c973e84cfb', // Toilet Brush Set +1
    'f69a7cc6-c3ac-421e-a007-612c30767cc1', // Toilet Brush Set+3
    '8ff758b4-f01f-4ebc-8bad-1f119650be83'  // Brush-Head-3Packs
  ];
  
  const stocks = await prisma.stock.findMany({
    where: { variantId: { in: variantIds } }
  });
  console.log('Stocks:', JSON.stringify(stocks, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
