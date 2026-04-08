/**
 * 将一次性马桶刷相关三个 SKU 的库存数修正为实盘（仅写 ProductVariant，与产品中心「库存」列一致）
 * 数量：Set+1 → 11320，Set+3 → 45352，Brush-Head-3Packs → 5104
 *
 * 说明：全量 syncProductVariantInventory 会按合同/入库重算覆盖；若之后又不对，需核对采购/入库单据或再执行本脚本。
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "../src/lib/prisma";
import { resolveVariantIdForContractSku } from "../src/lib/resolve-variant-by-contract-sku";

const TARGETS: { sku: string; qty: number }[] = [
  { sku: "Toilet Brush Set +1", qty: 11320 },
  { sku: "Toilet Brush Set+3", qty: 45352 },
  { sku: "Brush-Head-3Packs", qty: 5104 },
];

async function main() {
  for (const { sku, qty } of TARGETS) {
    const resolved = await resolveVariantIdForContractSku(sku);
    if (!resolved) {
      console.error(`[失败] 未找到变体: "${sku}"，请确认产品档案 skuId 存在`);
      continue;
    }

    await prisma.productVariant.update({
      where: { id: resolved.variantId },
      data: {
        atFactory: 0,
        atDomestic: qty,
        inTransit: 0,
        stockQuantity: qty,
      },
    });

    const stocks = await prisma.stock.findMany({
      where: { variantId: resolved.variantId },
    });

    if (stocks.length === 1) {
      const reserved = Math.max(0, stocks[0].reservedQty ?? 0);
      const availableQty = Math.max(0, qty - reserved);
      await prisma.stock.update({
        where: { id: stocks[0].id },
        data: {
          qty,
          availableQty,
        },
      });
      console.log(`[OK] ${resolved.catalogSkuId} → ${qty}（含 Stock 单行）`);
    } else if (stocks.length > 1) {
      console.warn(
        `[提示] ${resolved.catalogSkuId} 有多条 Stock（${stocks.length} 仓），仅已更新 ProductVariant；请各仓自行调平或删并`
      );
      console.log(`[OK] ProductVariant ${resolved.catalogSkuId} → ${qty}`);
    } else {
      console.log(`[OK] ${resolved.catalogSkuId} → ${qty}（无 Stock 分仓记录）`);
    }
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
