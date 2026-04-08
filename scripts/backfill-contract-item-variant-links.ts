/**
 * 补绑采购合同明细 variantId，并将 sku 文案统一为产品档案中的 skuId；
 * 并对每个已绑定变体执行 syncProductVariantInventory。
 *
 * 用法（在项目根目录 smart）：
 *   npx env-cmd -f .env.local npx tsx scripts/backfill-contract-item-variant-links.ts
 * 或：
 *   npm run backfill:contract-variants
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "../src/lib/prisma";
import { resolveVariantIdForContractSku } from "../src/lib/resolve-variant-by-contract-sku";
import { syncProductVariantInventory } from "../src/lib/inventory-sync";

async function main() {
  const items = await prisma.purchaseContractItem.findMany({
    where: { variantId: null },
    select: { id: true, sku: true },
    take: 5000,
    orderBy: { updatedAt: "asc" },
  });

  console.log(`待处理未绑定明细: ${items.length} 条`);

  let linked = 0;
  let skipped = 0;

  for (const item of items) {
    const resolved = await resolveVariantIdForContractSku(item.sku);
    if (!resolved) {
      skipped++;
      console.warn(`[跳过] 无匹配变体: "${item.sku}"`);
      continue;
    }

    await prisma.purchaseContractItem.update({
      where: { id: item.id },
      data: {
        variantId: resolved.variantId,
        sku: resolved.catalogSkuId,
      },
    });

    try {
      await syncProductVariantInventory(resolved.variantId);
    } catch (e) {
      console.warn(`[sync 警告] variant ${resolved.variantId}`, e);
    }

    linked++;
    console.log(`[OK] "${item.sku}" -> 档案「${resolved.catalogSkuId}」`);
  }

  console.log(`\n完成：补绑 ${linked} 条，无法匹配 ${skipped} 条（请先在产品档案创建对应 skuId）`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
