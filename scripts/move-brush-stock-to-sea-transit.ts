/**
 * 将马桶刷三 SKU 的库存从「国内待发」全部挪到「海运中」（装柜在途）
 * 不改变总件数：atFactory + atDomestic + inTransit = stockQuantity
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "../src/lib/prisma";
import { resolveVariantIdForContractSku } from "../src/lib/resolve-variant-by-contract-sku";

const SKUS = [
  "Toilet Brush Set +1",
  "Toilet Brush Set+3",
  "Brush-Head-3Packs",
];

async function main() {
  for (const sku of SKUS) {
    const resolved = await resolveVariantIdForContractSku(sku);
    if (!resolved) {
      console.error(`[跳过] 未找到变体: ${sku}`);
      continue;
    }

    const v = await prisma.productVariant.findUnique({
      where: { id: resolved.variantId },
      select: {
        atFactory: true,
        atDomestic: true,
        inTransit: true,
        stockQuantity: true,
      },
    });
    if (!v) continue;

    const atF = v.atFactory ?? 0;
    const atD = v.atDomestic ?? 0;
    const tr = v.inTransit ?? 0;
    const total = atF + atD + tr;

    await prisma.productVariant.update({
      where: { id: resolved.variantId },
      data: {
        atFactory: 0,
        atDomestic: 0,
        inTransit: total,
        stockQuantity: total,
      },
    });

    const stocks = await prisma.stock.findMany({
      where: { variantId: resolved.variantId },
    });
    if (stocks.length === 1) {
      const reserved = Math.max(0, stocks[0].reservedQty ?? 0);
      await prisma.stock.update({
        where: { id: stocks[0].id },
        data: {
          qty: total,
          availableQty: Math.max(0, total - reserved),
        },
      });
    }

    console.log(
      `[OK] ${resolved.catalogSkuId} 国内 ${atD} + 海运原 ${tr} + 工厂 ${atF} → 全部海运 ${total} 件`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
