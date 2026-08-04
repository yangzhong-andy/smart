const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL }
  }
});

async function main() {
  const skuId = "Brush-Head-3Packs";
  
  // 查找这个 SKU 的 variant
  const variant = await prisma.productVariant.findFirst({
    where: { skuId: skuId },
    include: { product: true }
  });
  
  console.log("=== ProductVariant ===");
  console.log(JSON.stringify(variant, null, 2));
  
  // 检查采购合同中这个 SKU 的完工数量
  const contractItems = await prisma.purchaseContractItem.findMany({
    where: { variantId: variant?.id },
    include: { contract: true }
  });
  
  console.log("\n=== 采购合同项 ===");
  console.log(JSON.stringify(contractItems, null, 2));
  
  // 检查待入库单
  const pendingInbound = await prisma.pendingInbound.findMany({
    where: { variantId: variant?.id }
  });
  
  console.log("\n=== 待入库单 ===");
  console.log(JSON.stringify(pendingInbound, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error(e); prisma.$disconnect(); });
