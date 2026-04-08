/**
 * 补救：
 * 1) 全量重算各变体库存（三分仓）
 * 2) 已绑定 variantId 的合同明细，若 sku 文案与档案 skuId 不一致则改为档案口径
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "../src/lib/prisma";
import { syncProductVariantInventory } from "../src/lib/inventory-sync";

async function main() {
  const items = await prisma.purchaseContractItem.findMany({
    where: { variantId: { not: null } },
    select: { id: true, sku: true, variantId: true },
  });

  let skuFixed = 0;
  for (const row of items) {
    if (!row.variantId) continue;
    const v = await prisma.productVariant.findUnique({
      where: { id: row.variantId },
      select: { skuId: true },
    });
    if (!v) continue;
    if (row.sku.trim() !== v.skuId.trim()) {
      await prisma.purchaseContractItem.update({
        where: { id: row.id },
        data: { sku: v.skuId },
      });
      skuFixed++;
      console.log(`[sku 对齐] ${row.sku} -> ${v.skuId}`);
    }
  }

  console.log(`合同明细 sku 文案已对齐: ${skuFixed} 条`);

  const map = await syncProductVariantInventory();
  console.log(`库存快照已同步变体数: ${Object.keys(map).length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
