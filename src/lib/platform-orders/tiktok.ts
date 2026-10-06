import { prisma } from "@/lib/prisma";
import { orderBusinessDate } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import type { PlatformOrderAdapter } from "./contract";

export const tikTokOrderAdapter: PlatformOrderAdapter = {
  platform: "TIKTOK",
  storageModel: "TikTokOrder",
  async searchOrders(input) {
    const allShops = await prisma.tikTokShopSetting.findMany({
      select: {
        shopId: true,
        shopName: true,
        region: true,
        storeId: true,
      },
    });
    const selectedCountry = input.countryCode ? normalizeCountryCode(input.countryCode) : null;
    const shops = allShops.filter((shop) => (
      (!input.externalShopId || shop.shopId === input.externalShopId)
      && (!selectedCountry || normalizeCountryCode(shop.region) === selectedCountry)
    ));
    const shopIds = shops.map((shop) => shop.shopId);
    if (shopIds.length === 0) return [];

    const orders = await prisma.tikTokOrder.findMany({
      where: {
        shopId: { in: shopIds },
        orderId: { contains: input.query },
      },
      select: {
        orderId: true,
        shopId: true,
        createTime: true,
        status: true,
        orderStatus: true,
        currency: true,
      },
      orderBy: [{ createTime: "desc" }, { orderId: "desc" }],
      take: input.limit,
    });
    const shopById = new Map(shops.map((shop) => [shop.shopId, shop]));

    return orders.map((order) => {
      const shop = shopById.get(order.shopId);
      const countryCode = normalizeCountryCode(shop?.region);
      const businessDate = order.createTime
        ? orderBusinessDate(order.createTime, countryCode)
        : null;
      return {
        platform: "TIKTOK" as const,
        orderId: order.orderId,
        shopId: order.shopId,
        shopName: shop?.shopName || order.shopId,
        storeId: shop?.storeId || null,
        countryCode,
        businessDate,
        createTime: order.createTime?.toISOString() || null,
        status: order.status || order.orderStatus || "UNKNOWN",
        currency: order.currency || null,
      };
    });
  },
};
