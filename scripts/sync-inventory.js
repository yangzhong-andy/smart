const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgres://484dab48f67b8bc08c4aaf395b638ed23820c03895407f0b0f2dec053233a9c1:sk_KsqI8aGmP9W77tJOHcBql@db.prisma.io:5432/postgres?sslmode=require' }
  }
});

async function main() {
  console.log('🔄 开始同步库存数据...\n');

  // 1. 从采购合同的 finishedQty 获取工厂完工数量 -> atFactory
  const contracts = await prisma.purchaseContract.findMany({
    include: {
      items: true
    }
  });

  // 汇总每个 variant 的工厂完工数量
  const factoryStock = {};
  for (const contract of contracts) {
    for (const item of contract.items) {
      const variantId = item.variantId;
      if (!variantId) continue;
      
      if (!factoryStock[variantId]) {
        factoryStock[variantId] = 0;
      }
      factoryStock[variantId] += item.finishedQty || 0;
    }
  }

  console.log('📦 工厂完工数量 (from PurchaseContractItem.finishedQty):');
  for (const [variantId, qty] of Object.entries(factoryStock)) {
    console.log(`  ${variantId}: ${qty}`);
  }

  // 2. 从待入库单的 receivedQty 获取国内入库数量 -> atDomestic
  const pendingInbound = await prisma.pendingInbound.findMany({
    where: { status: '已入库' }
  });

  const domesticStock = {};
  for (const item of pendingInbound) {
    const variantId = item.variantId;
    if (!variantId) continue;
    
    if (!domesticStock[variantId]) {
      domesticStock[variantId] = 0;
    }
    domesticStock[variantId] += item.receivedQty || 0;
  }

  console.log('\n🏠 国内入库数量 (from PendingInbound.receivedQty where 已入库):');
  for (const [variantId, qty] of Object.entries(domesticStock)) {
    console.log(`  ${variantId}: ${qty}`);
  }

  // 3. 更新 ProductVariant 的库存字段
  console.log('\n✏️  更新 ProductVariant 库存字段:');
  
  const allVariantIds = [...new Set([...Object.keys(factoryStock), ...Object.keys(domesticStock)])];
  
  for (const variantId of allVariantIds) {
    const atFactory = factoryStock[variantId] || 0;
    const atDomestic = domesticStock[variantId] || 0;
    const inTransit = 0; // 海运中暂时设为0
    
    await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        atFactory,
        atDomestic,
        inTransit,
        stockQuantity: atFactory + atDomestic + inTransit
      }
    });
    
    console.log(`  ✅ ${variantId}: atFactory=${atFactory}, atDomestic=${atDomestic}, inTransit=${inTransit}, total=${atFactory + atDomestic + inTransit}`);
  }

  console.log('\n🎉 库存同步完成！');
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
