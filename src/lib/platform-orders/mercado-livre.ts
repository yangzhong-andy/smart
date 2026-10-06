import { prisma } from "@/lib/prisma";
import { orderBusinessDate } from "@/lib/order-business-time";
import { normalizeCountryCode } from "@/lib/profit-schemes";
import type { PlatformOrderAdapter } from "./contract";

export const mercadoLivreOrderAdapter: PlatformOrderAdapter = {
  platform: "MERCADO_LIVRE",
  storageModel: "MercadoLivreOrder",
  async searchOrders(input) {
    const accounts = await prisma.mercadoLivreAccount.findMany({
      where: {
        status: "active",
        ...(input.externalShopId ? { userId: input.externalShopId } : {}),
        ...(input.countryCode ? { country: normalizeCountryCode(input.countryCode) } : {}),
      },
      select: { id: true, userId: true, nickname: true, country: true, storeId: true },
    });
    if (!accounts.length) return [];
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const orders = await prisma.mercadoLivreOrder.findMany({
      where: { accountId: { in: accounts.map((account) => account.id) }, externalOrderId: { contains: input.query, mode: "insensitive" } },
      select: { externalOrderId: true, accountId: true, dateCreated: true, status: true, currency: true },
      orderBy: [{ dateCreated: "desc" }, { externalOrderId: "desc" }],
      take: input.limit,
    });
    return orders.flatMap((order) => {
      const account = accountById.get(order.accountId);
      if (!account) return [];
      const countryCode = normalizeCountryCode(account.country);
      return [{
        platform: "MERCADO_LIVRE" as const,
        orderId: order.externalOrderId,
        shopId: account.userId,
        shopName: account.nickname || account.userId,
        storeId: account.storeId,
        countryCode,
        businessDate: order.dateCreated ? orderBusinessDate(order.dateCreated, countryCode) : null,
        createTime: order.dateCreated?.toISOString() || null,
        status: order.status || "UNKNOWN",
        currency: order.currency,
      }];
    });
  },
};
