const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: {
      OR: [
        { skuId: { contains: 'Toilet Brush' } },
        { skuId: { contains: 'Brush-Head' } }
      ]
    },
    take: 10
  });
  console.log('Variants:', JSON.stringify(variants, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
