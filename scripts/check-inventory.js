const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // 检查 products 表中是否有库存字段
  const products = await prisma.product.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      atFactory: true,
      atDomestic: true,
      inTransit: true
    }
  });
  console.log('Products with inventory:', JSON.stringify(products, null, 2));
  
  // 检查 variants 表
  const variants = await prisma.variant.findMany({
    take: 5,
    select: {
      id: true,
      skuId: true,
      atFactory: true,
      atDomestic: true,
      inTransit: true
    }
  });
  console.log('Variants with inventory:', JSON.stringify(variants, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
