const { PrismaClient } = require(`${process.cwd()}/node_modules/@prisma/client`);

const prisma = new PrismaClient();

async function main() {
  const shopId = "1842551792";
  const [shop, mappings, allShopeeMappings] = await Promise.all([
    prisma.shopeeShopSetting.findFirst({
      where: { shopId, status: "active" },
      select: { shopId: true, shopName: true, region: true },
    }),
    prisma.profitSkuMapping.findMany({
      where: { platform: "SHOPEE", shopId },
      select: {
        id: true,
        sellerSku: true,
        enabled: true,
        components: {
          select: { quantity: true, variant: { select: { skuId: true } } },
          orderBy: { variant: { skuId: "asc" } },
        },
      },
      orderBy: { sellerSku: "asc" },
    }),
    prisma.profitSkuMapping.findMany({
      where: { platform: "SHOPEE" },
      select: { id: true, platform: true, shopId: true, sellerSku: true },
    }),
  ]);

  const seen = new Map();
  for (const mapping of allShopeeMappings) {
    const key = `${mapping.platform}\u0000${mapping.shopId}\u0000${mapping.sellerSku}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const duplicateKeys = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key: key.replaceAll("\u0000", " / "), count }));

  console.log(JSON.stringify({ shop, mappings, totalShopeeMappings: allShopeeMappings.length, duplicateKeys }, null, 2));
}

main()
  .finally(() => prisma.$disconnect());
