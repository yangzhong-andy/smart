const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  const contractId = 'SDFY-BAXI20260307-1';
  
  // 找到合同
  const contracts = await prisma.purchaseContract.findMany({
    where: { contractNumber: contractId },
    include: { items: true }
  });
  console.log('Contract:', JSON.stringify(contracts, null, 2));
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
