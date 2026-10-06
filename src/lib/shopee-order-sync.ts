import { prisma } from "@/lib/prisma";
import {
  getShopeeEscrowDetail,
  getShopeeOrderDetails,
  getShopeeOrderList,
  ShopeeApiError,
  type ShopeeEnvironment,
  type ShopeeShopRequestInput,
} from "@/lib/shopee-open-api";
import { isShopeeTokenRefreshDue, refreshShopeeShopToken } from "@/lib/shopee-token-service";
import { normalizeShopeeOrder, shopeeIncrementalRange, splitShopeeOrderWindows } from "@/lib/shopee-orders";
import { reconcileShopeeStockForOrder } from "@/lib/shopee-stock-deduct";
import { isShopeeEscrowEligible, normalizeShopeeSettlement } from "@/lib/shopee-settlements";

type SyncRange = { timeFrom: number; timeTo: number };
type ShopWithApp = Awaited<ReturnType<typeof loadShop>>;

const syncInFlight = new Map<string, Promise<ShopeeOrderSyncResult>>();

export type ShopeeOrderSyncResult = {
  shopId: string;
  shopName: string;
  timeFrom: number;
  timeTo: number;
  listed: number;
  saved: number;
  windows: number;
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Shopee order sync failed");
}

function isTokenError(error: unknown) {
  if (!(error instanceof ShopeeApiError)) return false;
  const value = `${error.code || ""} ${error.message}`.toLowerCase();
  return value.includes("access_token") || value.includes("access token") || value.includes("auth");
}

async function loadShop(shopSettingId: string) {
  return prisma.shopeeShopSetting.findUnique({
    where: { id: shopSettingId },
    include: { appConfig: true, orderSyncCheckpoint: true },
  });
}

function apiInput(shop: NonNullable<ShopWithApp>): ShopeeShopRequestInput {
  if (!shop.accessToken) throw new Error(`Shopee shop ${shop.shopId} has no access token`);
  return {
    environment: shop.appConfig.environment as ShopeeEnvironment,
    partnerId: shop.appConfig.partnerId,
    partnerKey: shop.appConfig.partnerKey,
    accessToken: shop.accessToken,
    shopId: shop.shopId,
  };
}

export async function withFreshShopeeToken<T>(shopSettingId: string, call: (input: ShopeeShopRequestInput) => Promise<T>) {
  let shop = await loadShop(shopSettingId);
  if (!shop || shop.status !== "active" || shop.appConfig.status !== "active") {
    throw new Error("Shopee shop is not active");
  }
  if (isShopeeTokenRefreshDue(shop.tokenExpireAt)) {
    const refreshed = await refreshShopeeShopToken(shop.id, { trigger: "api-retry" });
    if (refreshed.status === "failed") throw new Error(refreshed.error || "Shopee token refresh failed");
    shop = await loadShop(shopSettingId);
    if (!shop) throw new Error("Shopee shop no longer exists");
  }
  try {
    return await call(apiInput(shop));
  } catch (error) {
    if (!isTokenError(error)) throw error;
    const refreshed = await refreshShopeeShopToken(shop.id, { force: true, trigger: "api-retry" });
    if (refreshed.status === "failed") throw error;
    const reloaded = await loadShop(shopSettingId);
    if (!reloaded) throw error;
    return call(apiInput(reloaded));
  }
}

export async function saveShopeeOrder(shop: NonNullable<ShopWithApp>, raw: Record<string, any>) {
  const normalized = normalizeShopeeOrder(raw, shop);
  await prisma.$transaction(async (tx) => {
    const order = await tx.shopeeOrder.upsert({
      where: { shopId_orderSn: { shopId: shop.shopId, orderSn: normalized.orderSn } },
      create: { orderSn: normalized.orderSn, ...normalized.data },
      update: normalized.data,
      select: { id: true },
    });
    await tx.shopeeOrderItem.deleteMany({ where: { orderId: order.id } });
    if (normalized.items.length > 0) {
      await tx.shopeeOrderItem.createMany({
        data: normalized.items.map((item) => ({ orderId: order.id, ...item })),
      });
    }
  });
  try {
    await reconcileShopeeStockForOrder(normalized.orderSn, shop.shopId);
  } catch (error) {
    // Order synchronization is the source record and must survive a separate
    // inventory mapping/balance issue. The next webhook or sync retries the
    // idempotent inventory reconciliation.
    console.error(`[Shopee Stock] ${normalized.orderSn} reconciliation failed`, error);
  }
}

export async function syncShopeeOrderBySn(input: { shopSettingId: string; orderSn: string }) {
  const orderSn = input.orderSn.trim();
  if (!orderSn) throw new Error("Shopee order number is required");
  const details = await withFreshShopeeToken(input.shopSettingId, (credentials) => getShopeeOrderDetails({
    ...credentials,
    orderSns: [orderSn],
  }));
  const raw = (details.order_list || []).find(
    (order) => String(order.order_sn || order.orderSn || "").trim() === orderSn,
  );
  if (!raw) throw new Error(`Shopee order ${orderSn} was not returned by the order detail API`);
  const shop = await loadShop(input.shopSettingId);
  if (!shop) throw new Error("Shopee shop no longer exists");
  await saveShopeeOrder(shop, raw);
  const savedOrder = await prisma.shopeeOrder.findUnique({
    where: { shopId_orderSn: { shopId: shop.shopId, orderSn } },
    select: {
      id: true,
      orderSn: true,
      shopSettingId: true,
      shopId: true,
      currency: true,
      status: true,
    },
  });
  if (savedOrder && isShopeeEscrowEligible(savedOrder.status)) {
    try {
      const escrow = await withFreshShopeeToken(input.shopSettingId, (credentials) =>
        getShopeeEscrowDetail({ ...credentials, orderSn }),
      );
      const settlement = normalizeShopeeSettlement(escrow as Record<string, any>, savedOrder);
      await prisma.shopeeSettlement.upsert({
        where: { shopId_orderSn: { shopId: shop.shopId, orderSn } },
        create: settlement,
        update: settlement,
      });
    } catch (error) {
      // Shopee may not have generated order_income yet. The scheduled settlement
      // sync retries it, so an income delay must never fail the order/webhook sync.
      console.warn(`[Shopee Income] ${orderSn} refresh deferred: ${safeError(error)}`);
    }
  }
  return { shopId: shop.shopId, orderSn };
}

async function syncShop(shopSettingId: string, range: SyncRange): Promise<ShopeeOrderSyncResult> {
  const shop = await loadShop(shopSettingId);
  if (!shop) throw new Error("Shopee shop not found");
  const startedAt = new Date();
  await prisma.shopeeOrderSyncCheckpoint.upsert({
    where: { shopSettingId },
    create: { shopSettingId, status: "running", lastAttemptAt: startedAt },
    update: { status: "running", lastAttemptAt: startedAt, lastError: null },
  });

  let listed = 0;
  let saved = 0;
  const windows = splitShopeeOrderWindows(range.timeFrom, range.timeTo);
  try {
    for (const window of windows) {
      let cursor: string | undefined;
      let page = 0;
      do {
        if (++page > 1_000) throw new Error("Shopee order pagination exceeded the safety limit");
        const response = await withFreshShopeeToken(shopSettingId, (credentials) => getShopeeOrderList({
          ...credentials,
          ...window,
          cursor,
          pageSize: 100,
        }));
        const orderSns = Array.from(new Set(
          (response.order_list || []).map((order) => String(order.order_sn || "").trim()).filter(Boolean),
        ));
        listed += orderSns.length;

        for (let index = 0; index < orderSns.length; index += 50) {
          const batch = orderSns.slice(index, index + 50);
          const details = await withFreshShopeeToken(shopSettingId, (credentials) => getShopeeOrderDetails({
            ...credentials,
            orderSns: batch,
          }));
          for (const raw of details.order_list || []) {
            await saveShopeeOrder(shop, raw);
            saved += 1;
          }
        }
        cursor = response.more && response.next_cursor ? response.next_cursor : undefined;
      } while (cursor);
    }

    const previousTo = shop.orderSyncCheckpoint?.lastSuccessfulTo;
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.shopeeOrderSyncCheckpoint.update({
        where: { shopSettingId },
        data: {
          status: "success",
          lastError: null,
          lastSuccessfulFrom: new Date(range.timeFrom * 1000),
          lastSuccessfulTo: previousTo && previousTo.getTime() > range.timeTo * 1000
            ? previousTo
            : new Date(range.timeTo * 1000),
          lastSuccessfulSyncAt: completedAt,
          ordersProcessed: saved,
        },
      }),
      prisma.shopeeShopSetting.update({ where: { id: shopSettingId }, data: { lastSyncAt: completedAt } }),
    ]);
    return { shopId: shop.shopId, shopName: shop.shopName || shop.shopId, ...range, listed, saved, windows: windows.length };
  } catch (error) {
    await prisma.shopeeOrderSyncCheckpoint.update({
      where: { shopSettingId },
      data: { status: "failed", lastError: safeError(error), ordersProcessed: saved },
    });
    throw error;
  }
}

export function syncShopeeShopOrders(shopSettingId: string, range: SyncRange) {
  const existing = syncInFlight.get(shopSettingId);
  if (existing) return existing;
  const promise = syncShop(shopSettingId, range).finally(() => syncInFlight.delete(shopSettingId));
  syncInFlight.set(shopSettingId, promise);
  return promise;
}

export async function syncShopeeOrders(input: { shopId?: string; timeFrom: number; timeTo: number }) {
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active", ...(input.shopId ? { shopId: input.shopId } : {}), appConfig: { status: "active" } },
    select: { id: true, shopId: true },
    orderBy: { createdAt: "asc" },
  });
  const results: ShopeeOrderSyncResult[] = [];
  const errors: Array<{ shopId: string; error: string }> = [];
  for (const shop of shops) {
    try {
      results.push(await syncShopeeShopOrders(shop.id, { timeFrom: input.timeFrom, timeTo: input.timeTo }));
    } catch (error) {
      errors.push({ shopId: shop.shopId, error: safeError(error) });
    }
  }
  return { shops: shops.length, results, errors };
}

export async function syncIncrementalShopeeOrders(input: { shopId?: string } = {}) {
  const shops = await prisma.shopeeShopSetting.findMany({
    where: { status: "active", ...(input.shopId ? { shopId: input.shopId } : {}), appConfig: { status: "active" } },
    select: { id: true, shopId: true, orderSyncCheckpoint: { select: { lastSuccessfulTo: true } } },
    orderBy: { createdAt: "asc" },
  });
  const nowSeconds = Math.floor(Date.now() / 1000);
  const results: ShopeeOrderSyncResult[] = [];
  const errors: Array<{ shopId: string; error: string }> = [];
  for (const shop of shops) {
    try {
      results.push(await syncShopeeShopOrders(
        shop.id,
        shopeeIncrementalRange(shop.orderSyncCheckpoint?.lastSuccessfulTo || null, nowSeconds),
      ));
    } catch (error) {
      errors.push({ shopId: shop.shopId, error: safeError(error) });
    }
  }
  return { shops: shops.length, results, errors };
}
