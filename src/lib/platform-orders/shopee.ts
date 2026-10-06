import { prisma } from "@/lib/prisma";
import { orderBusinessDate } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import type { PlatformOrderAdapter } from "./contract";

export const shopeeOrderAdapter: PlatformOrderAdapter = {
  platform: "SHOPEE",
  storageModel: "ShopeeOrder",
  async searchOrders(input) {
    const orders = await prisma.shopeeOrder.findMany({
      where: {
        orderSn: { contains: input.query, mode: "insensitive" },
        ...(input.externalShopId ? { shopId: input.externalShopId } : {}),
        ...(input.countryCode ? { shopSetting: { region: input.countryCode } } : {}),
      },
      include: { shopSetting: { select: { shopName: true, region: true, storeId: true } } },
      orderBy: [{ createTime: "desc" }, { orderSn: "desc" }],
      take: input.limit,
    });
    return orders.map((order) => {
      const countryCode = normalizeCountryCode(order.shopSetting.region);
      return ({
      platform: "SHOPEE" as const,
      orderId: order.orderSn,
      shopId: order.shopId,
      shopName: order.shopSetting.shopName || order.shopId,
      storeId: order.shopSetting.storeId,
      countryCode,
      businessDate: order.createTime
        ? orderBusinessDate(order.createTime, countryCode)
        : null,
      createTime: order.createTime?.toISOString() || null,
      status: order.status || "UNKNOWN",
      currency: order.currency,
      });
    });
  },
};
