import { prisma } from "/srv/smart-erp/baxi/current/src/lib/prisma";
import { getShopeeEscrowDetail } from "/srv/smart-erp/baxi/current/src/lib/shopee-open-api";
import { withFreshShopeeToken } from "/srv/smart-erp/baxi/current/src/lib/shopee-order-sync";
import { normalizeShopeeSettlement } from "/srv/smart-erp/baxi/current/src/lib/shopee-settlements";

async function main() {
  const orderSn = process.argv[2];
  if (!orderSn) throw new Error("Shopee order number is required");
  const order = await prisma.shopeeOrder.findFirst({
    where: { orderSn },
    select: { id: true, orderSn: true, shopSettingId: true, shopId: true, currency: true },
  });
  if (!order) throw new Error(`Shopee order ${orderSn} was not found`);

  const raw = await withFreshShopeeToken(order.shopSettingId, (credentials) => (
    getShopeeEscrowDetail({ ...credentials, orderSn: order.orderSn })
  ));
  const data = normalizeShopeeSettlement(raw as Record<string, unknown>, order);
  await prisma.shopeeSettlement.upsert({
    where: { shopId_orderSn: { shopId: order.shopId, orderSn: order.orderSn } },
    create: data,
    update: data,
  });
  console.log(JSON.stringify({ orderSn: order.orderSn, saved: true }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
