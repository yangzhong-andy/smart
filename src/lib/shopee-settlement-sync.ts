import { prisma } from "@/lib/prisma";
import { getShopeeEscrowDetail } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import {
  normalizeShopeeSettlement,
  SHOPEE_ESCROW_ELIGIBLE_STATUSES,
  shopeeEscrowNeedsRefresh,
  shopeeSettlementRange,
} from "@/lib/shopee-settlements";
import { syncShopeeSettlementWalletEntries } from "@/lib/shopee-wallet-settlement-sync";
import { syncShopeeOrderAdvertisingFunding } from "@/lib/shopee-ad-wallet-sync";

function message(error: unknown) { return error instanceof Error ? error.message : String(error || "Shopee settlement sync failed"); }

export async function syncShopeeSettlements(input: {
  shopId?: string;
  days?: number;
  missingOnly?: boolean;
  batchSize?: number;
} = {}) {
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active", ...(input.shopId ? { shopId: input.shopId } : {}), appConfig: { status: "active" } },
    select: { id: true, shopId: true, shopName: true },
    orderBy: { createdAt: "asc" },
  });
  const results: Array<{
    shopId: string;
    shopName: string;
    eligible: number;
    processed: number;
    remaining: number;
    saved: number;
    skipped: number;
  }> = [];
  const errors: Array<{ shopId: string; orderSn?: string; error: string }> = [];
  const createTime = { gte: shopeeSettlementRange(input.days || 365) };
  const batchSize = Math.min(500, Math.max(1, Math.trunc(input.batchSize || 200)));
  const now = new Date();

  for (const shop of shops) {
    const candidates = await prisma.shopeeOrder.findMany({
      where: {
        shopSettingId: shop.id,
        status: { in: [...SHOPEE_ESCROW_ELIGIBLE_STATUSES] },
        createTime,
        ...(input.missingOnly ? { settlement: null } : {}),
      },
      select: {
        id: true,
        orderSn: true,
        shopSettingId: true,
        shopId: true,
        currency: true,
        status: true,
        updateTime: true,
        settlement: { select: { syncedAt: true } },
      },
      orderBy: [{ updateTime: "desc" }, { orderSn: "desc" }],
    });
    const eligible = candidates.filter((order) => (
      input.missingOnly ? !order.settlement : shopeeEscrowNeedsRefresh(order, now)
    ));
    const orders = eligible.slice(0, batchSize);
    let saved = 0; let skipped = 0;
    for (const order of orders) {
      try {
        const raw = await withFreshShopeeToken(shop.id, (credentials) => getShopeeEscrowDetail({ ...credentials, orderSn: order.orderSn }));
        const data = normalizeShopeeSettlement(raw as Record<string, any>, order);
        await prisma.shopeeSettlement.upsert({
          where: { shopId_orderSn: { shopId: shop.shopId, orderSn: order.orderSn } },
          create: data,
          update: data,
        });
        saved += 1;
      } catch (error) {
        skipped += 1;
        if (errors.length < 50) errors.push({ shopId: shop.shopId, orderSn: order.orderSn, error: message(error) });
      }
    }
    results.push({
      shopId: shop.shopId,
      shopName: shop.shopName || shop.shopId,
      eligible: eligible.length,
      saved,
      skipped,
      processed: orders.length,
      remaining: Math.max(0, eligible.length - orders.length),
    });
  }
  const walletSync = await syncShopeeSettlementWalletEntries({
    shopId: input.shopId,
    days: input.days || 730,
  });
  const advertisingWalletSync = await syncShopeeOrderAdvertisingFunding({
    shopId: input.shopId,
    days: input.days || 730,
  });
  return { shops: shops.length, results, errors, walletSync, advertisingWalletSync };
}
