/**
 * 将「国内仓」Warehouse.type=DOMESTIC 下的 Stock 账面数量清零。
 * 适用于：货已装柜发运、不在国内物理仓，仅保留产品变体上的 inTransit 等口径。
 *
 * 默认不修改 ProductVariant（请事先用库存查询/对账页确认 atDomestic/inTransit 已正确）。
 * 运行：npx tsx scripts/clear-domestic-warehouse-stock.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { WarehouseType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

async function main() {
  const before = await prisma.stock.findMany({
    where: { Warehouse: { type: WarehouseType.DOMESTIC }, qty: { gt: 0 } },
    select: { id: true, variantId: true, qty: true },
  });

  if (before.length === 0) {
    console.log("没有需要清零的国内仓 Stock 记录。");
    return;
  }

  const sumQty = before.reduce((s, r) => s + r.qty, 0);
  console.log(`即将清零 ${before.length} 条国内仓库存行，合计 ${sumQty} 件。`);

  const result = await prisma.stock.updateMany({
    where: { Warehouse: { type: WarehouseType.DOMESTIC }, qty: { gt: 0 } },
    data: {
      qty: 0,
      availableQty: 0,
      reservedQty: 0,
    },
  });

  console.log(`[OK] 已更新 ${result.count} 条 Stock 记录（国内仓 qty/可用/锁定 归零）。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
