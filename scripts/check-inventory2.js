const { PrismaClient } = require('@prisma/client');

// 使用 Prisma Demo 数据库
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  // 检查 ProductVariant 的库存字段
  const variants = await prisma.productVariant.findMany({
    take: 10,
    include: {
      product: {
        select: { name: true }
      }
    }
  });
  
  console.log('=== ProductVariant 库存数据 ===');
  console.log(JSON.stringify(variants, null, 2));
  
  // 统计总数
  const total = await prisma.productVariant.count();
  const withStock = await prisma.productVariant.count({
    where: {
      OR: [
        { atFactory: { gt: 0 } },
        { atDomestic: { gt: 0 } },
        { inTransit: { gt: 0 } }
      ]
    }
  });
  
  console.log(`\n总SKU数: ${total}`);
  console.log(`有库存的SKU数: ${withStock}`);
  console.log(`无库存的SKU数: ${total - withStock}`);
  
  // 检查 InventoryStock 表
  const inventoryStocks = await prisma.inventoryStock.findMany({
    take: 10
  });
  console.log('\n=== InventoryStock 数据 ===');
  console.log(JSON.stringify(inventoryStocks, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
