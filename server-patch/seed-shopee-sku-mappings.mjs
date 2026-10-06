import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const definitions = [
  { sellerSku: "F001", components: [{ skuId: "Toilet Brush Set +1", quantity: 1 }] },
  { sellerSku: "F002", components: [{ skuId: "Toilet Brush Set+3", quantity: 1 }] },
  { sellerSku: "F003", components: [{ skuId: "Brush-Head-3Packs", quantity: 1 }] },
  { sellerSku: "FY-2F001", components: [{ skuId: "Toilet Brush Set +1", quantity: 2 }] },
  { sellerSku: "FY-2F002", components: [{ skuId: "Toilet Brush Set+3", quantity: 2 }] },
];

async function main() {
  const shop = await prisma.shopeeShopSetting.findFirst({
    where: { shopId: "1842551792", status: "active" },
    select: { shopId: true, shopName: true },
  });
  if (!shop) {
    console.log(JSON.stringify({ skipped: true, reason: "Shopee shop 1842551792 is not active" }));
    return;
  }

  const sourceSkus = new Set([
    ...(await prisma.shopeeProductModel.findMany({
      where: { product: { shopId: shop.shopId }, modelSku: { in: definitions.map((row) => row.sellerSku) } },
      select: { modelSku: true },
    })).map((row) => row.modelSku).filter(Boolean),
    ...(await prisma.shopeeOrderItem.findMany({
      where: { order: { shopId: shop.shopId }, modelSku: { in: definitions.map((row) => row.sellerSku) } },
      distinct: ["modelSku"],
      select: { modelSku: true },
    })).map((row) => row.modelSku).filter(Boolean),
  ]);
  const missingSourceSkus = definitions.map((row) => row.sellerSku).filter((sku) => !sourceSkus.has(sku));
  if (missingSourceSkus.length > 0) throw new Error(`Shopee source SKU missing: ${missingSourceSkus.join(", ")}`);

  const internalSkuIds = [...new Set(definitions.flatMap((row) => row.components.map((component) => component.skuId)))];
  const variants = await prisma.productVariant.findMany({
    where: { skuId: { in: internalSkuIds } },
    select: { id: true, skuId: true },
  });
  const variantBySku = new Map(variants.map((variant) => [variant.skuId, variant]));
  const missingInternalSkus = internalSkuIds.filter((sku) => !variantBySku.has(sku));
  if (missingInternalSkus.length > 0) throw new Error(`Internal SKU missing: ${missingInternalSkus.join(", ")}`);

  const saved = [];
  for (const definition of definitions) {
    const mapping = await prisma.$transaction(async (tx) => {
      const row = await tx.profitSkuMapping.upsert({
        where: {
          platform_shopId_sellerSku: {
            platform: "SHOPEE",
            shopId: shop.shopId,
            sellerSku: definition.sellerSku,
          },
        },
        create: {
          platform: "SHOPEE",
          shopId: shop.shopId,
          sellerSku: definition.sellerSku,
          enabled: true,
          notes: "依据 Shopee 官方商品变体与历史订单 SKU 核对（2026-08-30）",
        },
        update: {
          enabled: true,
          notes: "依据 Shopee 官方商品变体与历史订单 SKU 核对（2026-08-30）",
        },
        select: { id: true },
      });
      await tx.profitSkuMappingComponent.deleteMany({ where: { mappingId: row.id } });
      await tx.profitSkuMappingComponent.createMany({
        data: definition.components.map((component) => ({
          mappingId: row.id,
          variantId: variantBySku.get(component.skuId).id,
          quantity: component.quantity,
        })),
      });
      return row;
    });
    saved.push({ ...definition, id: mapping.id });
  }

  console.log(JSON.stringify({ shop, saved }, null, 2));
}

main().finally(() => prisma.$disconnect());
