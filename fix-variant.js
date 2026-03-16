const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  const contractId = '602341f7-66f6-4514-80f1-8dd9e77574f1';
  
  // 更新 items 的 variantId
  const updates = [
    { sku: 'Toilet Brush Set +1', variantId: 'f3f61c84-36ff-4035-85c5-75c973e84cfb' },
    { sku: 'Toilet Brush Set+3', variantId: 'f69a7cc6-c3ac-421e-a007-612c30767cc1' },
    { sku: 'Brush-Head-3Packs', variantId: '8ff758b4-f01f-4ebc-8bad-1f119650be83' }
  ];
  
  for (const u of updates) {
    const result = await prisma.purchaseContractItem.updateMany({
      where: { contractId, sku: u.sku },
      data: { variantId: u.variantId }
    });
    console.log(`Updated ${u.sku}:`, result);
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
