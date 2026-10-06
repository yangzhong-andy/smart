#!/usr/bin/env bash
set -euo pipefail

app_name="${1:-smart-baxi}"
app_dir="${2:-/srv/smart-erp/baxi/current}"
pid="$(pm2 pid "$app_name")"
database_url="$(tr '\0' '\n' < "/proc/${pid}/environ" | sed -n 's/^DATABASE_URL=//p')"

cd "$app_dir"
DATABASE_URL="$database_url" node <<'NODE'
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const [shops, products, orderSkus, variants, mappings] = await Promise.all([
    prisma.shopeeShopSetting.findMany({
      where: { status: "active" },
      select: { shopId: true, shopName: true, region: true },
    }),
    prisma.shopeeProduct.findMany({
      include: {
        models: {
          select: { modelId: true, modelName: true, modelSku: true, modelStatus: true },
          orderBy: { modelId: "asc" },
        },
      },
      orderBy: { itemId: "asc" },
    }),
    prisma.shopeeOrderItem.groupBy({
      by: ["itemSku", "modelSku", "itemName", "modelName"],
      _count: { _all: true },
      _sum: { quantity: true },
      orderBy: { itemName: "asc" },
    }),
    prisma.productVariant.findMany({
      select: { id: true, skuId: true, product: { select: { name: true } } },
      orderBy: { skuId: "asc" },
    }),
    prisma.profitSkuMapping.findMany({
      include: {
        components: {
          select: { quantity: true, variant: { select: { id: true, skuId: true } } },
        },
      },
      orderBy: [{ platform: "asc" }, { shopId: "asc" }, { sellerSku: "asc" }],
    }),
  ]);
  console.log(JSON.stringify({ shops, products, orderSkus, variants, mappings }, null, 2));
}

main().finally(() => prisma.$disconnect());
NODE
