const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  const warehouseId = '272fe4ae-7329-4113-8920-479b27ec79fc';
  
  // 删除错误的库存记录
  await prisma.stock.deleteMany({
    where: { id: '01da3e18-cdd4-466a-897b-a94950562da4' }
  });
  console.log('Deleted wrong stock record');
  
  // 创建3条正确的库存记录
  const items = [
    { variantId: 'f3f61c84-36ff-4035-85c5-75c973e84cfb', qty: 2200 },  // Toilet Brush Set +1
    { variantId: 'f69a7cc6-c3ac-421e-a007-612c30767cc1', qty: 8792 }, // Toilet Brush Set+3
    { variantId: '8ff758b4-f01f-4ebc-8bad-1f119650be83', qty: 2464 }  // Brush-Head-3Packs
  ];
  
  for (const item of items) {
    await prisma.stock.create({
      data: {
        variantId: item.variantId,
        warehouseId,
        qty: item.qty,
        reservedQty: 0,
        availableQty: item.qty
      }
    });
    console.log(`Created stock for variant ${item.variantId}: ${item.qty}`);
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
