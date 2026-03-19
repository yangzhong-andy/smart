const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  const batchId = '4c3acb86-3ebe-4602-b707-d0cfd81387f4';
  const now = new Date();
  const batchNum = 'IB-20260316-RF52';
  const warehouseId = '272fe4ae-7329-4113-8920-479b27ec79fc';
  
  // 删除旧批次
  await prisma.inboundBatch.delete({ where: { id: batchId } });
  console.log('Deleted old batch');
  
  // 创建3条正确的批次记录
  const items = [
    { sku: 'Toilet Brush Set +1', qty: 2200 },
    { sku: 'Toilet Brush Set+3', qty: 8792 },
    { sku: 'Brush-Head-3Packs', qty: 2464 }
  ];
  
  for (let i = 0; i < items.length; i++) {
    await prisma.inboundBatch.create({
      data: {
        pendingInboundId: '58d9f3e5-c8e0-4755-9ee4-3aaa580ce64d',
        batchNumber: `${batchNum}-${i + 1}`,
        warehouseId,
        warehouseName: '国内虚拟仓A',
        qty: items[i].qty,
        receivedDate: now,
        notes: `拿货单 DO-1773480068604 入库 - ${items[i].sku} x${items[i].qty}`
      }
    });
    console.log(`Created batch for ${items[i].sku}: ${items[i].qty}`);
  }
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
