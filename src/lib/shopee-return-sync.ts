import { prisma } from "@/lib/prisma";
import { getShopeeReturnList } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";
import { normalizeShopeeReturn, splitShopeeReturnWindows } from "@/lib/shopee-returns";

type Range = { timeFrom: number; timeTo: number };

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Shopee return sync failed");
}

async function saveReturn(shop: { id: string; shopId: string }, raw: Record<string, any>) {
  const normalized = normalizeShopeeReturn(raw, shop);
  const linkedOrder = normalized.orderSn
    ? await prisma.shopeeOrder.findUnique({
      where: { shopId_orderSn: { shopId: shop.shopId, orderSn: normalized.orderSn } },
      select: { id: true },
    })
    : null;

  await prisma.$transaction(async (tx) => {
    const returnCase = await tx.shopeeReturn.upsert({
      where: { shopId_returnSn: { shopId: shop.shopId, returnSn: normalized.returnSn } },
      create: {
        returnSn: normalized.returnSn,
        orderSn: normalized.orderSn,
        orderId: linkedOrder?.id || null,
        ...normalized.data,
      },
      update: {
        orderSn: normalized.orderSn,
        orderId: linkedOrder?.id || null,
        ...normalized.data,
      },
      select: { id: true },
    });
    await tx.shopeeReturnItem.deleteMany({ where: { returnId: returnCase.id } });
    if (normalized.items.length > 0) {
      await tx.shopeeReturnItem.createMany({
        data: normalized.items.map((item) => ({ returnId: returnCase.id, ...item })),
      });
    }
  });
}

async function syncShop(shop: { id: string; shopId: string; shopName: string | null }, range: Range) {
  let listed = 0;
  let saved = 0;
  const windows = splitShopeeReturnWindows(range.timeFrom, range.timeTo);
  for (const window of windows) {
    let pageNo = 1;
    for (;;) {
      if (pageNo > 10_000) throw new Error("Shopee return pagination exceeded the safety limit");
      const response = await withFreshShopeeToken(shop.id, (credentials) => getShopeeReturnList({
        ...credentials,
        pageNo,
        pageSize: 100,
        createTimeFrom: window.timeFrom,
        createTimeTo: window.timeTo,
      }));
      const rows = Array.isArray(response.return) ? response.return : [];
      listed += rows.length;
      for (const raw of rows) {
        await saveReturn(shop, raw);
        saved += 1;
      }
      if (!response.more) break;
      pageNo += 1;
    }
  }
  return {
    shopId: shop.shopId,
    shopName: shop.shopName || shop.shopId,
    ...range,
    listed,
    saved,
    windows: windows.length,
  };
}

export async function syncShopeeReturns(input: { shopId?: string; timeFrom: number; timeTo: number }) {
  const shops = await prisma.shopeeShopSetting.findMany({
    where: {
      status: "active",
      ...(input.shopId ? { shopId: input.shopId } : {}),
      appConfig: { status: "active" },
    },
    select: { id: true, shopId: true, shopName: true },
    orderBy: { createdAt: "asc" },
  });
  const results = [];
  const errors: Array<{ shopId: string; error: string }> = [];
  for (const shop of shops) {
    try {
      results.push(await syncShop(shop, input));
    } catch (error) {
      errors.push({ shopId: shop.shopId, error: message(error) });
    }
  }
  return { shops: shops.length, results, errors };
}

export function shopeeReturnRange(days = 30, nowSeconds = Math.floor(Date.now() / 1000)) {
  const safeDays = Math.min(730, Math.max(1, Math.trunc(days)));
  return { timeFrom: nowSeconds - safeDays * 24 * 60 * 60, timeTo: nowSeconds };
}
