const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  // 检查采购合同
  const contracts = await prisma.purchaseContract.findMany({
    take: 10,
    select: {
      id: true,
      contractNumber: true,
      status: true,
      items: true
    }
  });
  
  console.log('=== 采购合同 ===');
  console.log(JSON.stringify(contracts, null, 2));
  
  // 检查 InventoryMovement
  const movements = await prisma.inventoryMovement.findMany({
    take: 10
  });
  
  console.log('\n=== InventoryMovement ===');
  console.log(JSON.stringify(movements, null, 2));
  
  // 检查 PendingInbound
  const pendingInbound = await prisma.pendingInbound.findMany({
    take: 10
  });
  
  console.log('\n=== PendingInbound ===');
  console.log(JSON.stringify(pendingInbound, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
