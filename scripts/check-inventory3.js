const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
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
