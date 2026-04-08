/**
 * 全量重算 ProductVariant 三分仓 + stockQuantity（与合同/入库/出库对齐）
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { prisma } from "../src/lib/prisma";
import { syncProductVariantInventory } from "../src/lib/inventory-sync";

async function main() {
  const map = await syncProductVariantInventory();
  const n = Object.keys(map).length;
  console.log(`已同步 ${n} 个变体库存快照`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
