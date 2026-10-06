import { prisma } from "@/lib/prisma";
import {
  refreshShopeeToken,
  ShopeeApiError,
  type ShopeeEnvironment,
} from "@/lib/shopee-open-api";

export const SHOPEE_TOKEN_REFRESH_LEAD_MS = 60 * 60 * 1000;
const MAX_REFRESH_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 1_000, 3_000];

export type ShopeeTokenRefreshTrigger = "scheduled" | "manual" | "api-retry";
export type ShopeeTokenRefreshResult = {
  shopId: string;
  shopName: string | null;
  status: "refreshed" | "skipped" | "superseded" | "failed";
  previousExpireAt: Date | null;
  newExpireAt: Date | null;
  attempts: number;
  error: string | null;
};

const refreshInFlight = new Map<string, Promise<ShopeeTokenRefreshResult>>();

export function isShopeeTokenRefreshDue(
  tokenExpireAt: Date | null,
  now = new Date(),
  leadMs = SHOPEE_TOKEN_REFRESH_LEAD_MS,
) {
  return !tokenExpireAt || tokenExpireAt.getTime() <= now.getTime() + leadMs;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Shopee token refresh failed";
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function isInvalidRefreshToken(error: unknown) {
  if (!(error instanceof ShopeeApiError)) return false;
  const code = (error.code || "").toLowerCase();
  const message = error.message.toLowerCase();
  return code.includes("refresh_token") || message.includes("refresh token is invalid");
}

async function refreshShopToken(
  shopSettingId: string,
  options: { force: boolean; trigger: ShopeeTokenRefreshTrigger },
): Promise<ShopeeTokenRefreshResult> {
  const shop = await prisma.shopeeShopSetting.findUnique({
    where: { id: shopSettingId },
    include: { appConfig: true },
  });
  if (!shop) throw new Error("Shopee shop authorization was not found");

  const base = {
    shopId: shop.shopId,
    shopName: shop.shopName,
    previousExpireAt: shop.tokenExpireAt,
  };
  if (!options.force && !isShopeeTokenRefreshDue(shop.tokenExpireAt)) {
    return { ...base, status: "skipped", newExpireAt: shop.tokenExpireAt, attempts: 0, error: null };
  }

  if (!shop.refreshToken) {
    const message = "Refresh Token is missing; reauthorization is required";
    await prisma.$transaction([
      prisma.shopeeShopSetting.update({
        where: { id: shop.id },
        data: {
          status: "expired",
          tokenRefreshFailedAt: new Date(),
          tokenRefreshFailureCount: { increment: 1 },
          tokenRefreshError: message,
        },
      }),
      prisma.shopeeTokenRefreshLog.create({
        data: {
          shopSettingId: shop.id,
          status: "failed",
          trigger: options.trigger,
          previousExpireAt: shop.tokenExpireAt,
          message,
        },
      }),
    ]);
    return { ...base, status: "failed", newExpireAt: null, attempts: 0, error: message };
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
    if (RETRY_DELAYS_MS[attempt - 1]) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    try {
      const token = await refreshShopeeToken({
        environment: shop.appConfig.environment as ShopeeEnvironment,
        partnerId: shop.appConfig.partnerId,
        partnerKey: shop.appConfig.partnerKey,
        refreshToken: shop.refreshToken,
        shopId: shop.shopId,
      });
      const accessToken = String(token.access_token || token.accessToken || "").trim();
      const refreshToken = String(token.refresh_token || token.refreshToken || shop.refreshToken).trim();
      const expireIn = Number(token.expire_in || token.expireIn);
      if (!accessToken || !refreshToken || !Number.isFinite(expireIn) || expireIn <= 0) {
        throw new Error("Shopee returned an incomplete token refresh response");
      }

      const refreshedAt = new Date();
      const newExpireAt = new Date(refreshedAt.getTime() + expireIn * 1000);
      const updated = await prisma.shopeeShopSetting.updateMany({
        where: { id: shop.id, refreshToken: shop.refreshToken },
        data: {
          accessToken,
          refreshToken,
          tokenExpireAt: newExpireAt,
          tokenRefreshedAt: refreshedAt,
          tokenRefreshFailedAt: null,
          tokenRefreshFailureCount: 0,
          tokenRefreshError: null,
          status: "active",
        },
      });

      if (updated.count === 0) {
        await prisma.shopeeTokenRefreshLog.create({
          data: {
            shopSettingId: shop.id,
            status: "superseded",
            trigger: options.trigger,
            previousExpireAt: shop.tokenExpireAt,
            message: "A concurrent refresh stored a newer token first",
          },
        });
        return { ...base, status: "superseded", newExpireAt: null, attempts: attempt, error: null };
      }

      await prisma.shopeeTokenRefreshLog.create({
        data: {
          shopSettingId: shop.id,
          status: "success",
          trigger: options.trigger,
          previousExpireAt: shop.tokenExpireAt,
          newExpireAt,
        },
      });
      console.log(`[Shopee Token] refreshed shop ${shop.shopId}; expires ${newExpireAt.toISOString()}`);
      return { ...base, status: "refreshed", newExpireAt, attempts: attempt, error: null };
    } catch (error) {
      lastError = error;
      if (isInvalidRefreshToken(error)) break;
    }
  }

  const message = safeError(lastError);
  const invalidRefreshToken = isInvalidRefreshToken(lastError);
  const failedAt = new Date();
  await prisma.$transaction([
    prisma.shopeeShopSetting.update({
      where: { id: shop.id },
      data: {
        ...(invalidRefreshToken ? { status: "expired" } : {}),
        tokenRefreshFailedAt: failedAt,
        tokenRefreshFailureCount: { increment: 1 },
        tokenRefreshError: message,
      },
    }),
    prisma.shopeeTokenRefreshLog.create({
      data: {
        shopSettingId: shop.id,
        status: "failed",
        trigger: options.trigger,
        previousExpireAt: shop.tokenExpireAt,
        message,
      },
    }),
  ]);
  console.error(`[Shopee Token] refresh failed for shop ${shop.shopId}: ${message}`);
  return {
    ...base,
    status: "failed",
    newExpireAt: null,
    attempts: MAX_REFRESH_ATTEMPTS,
    error: message,
  };
}

export function refreshShopeeShopToken(
  shopSettingId: string,
  options: { force?: boolean; trigger?: ShopeeTokenRefreshTrigger } = {},
) {
  const existing = refreshInFlight.get(shopSettingId);
  if (existing) return existing;
  const promise = refreshShopToken(shopSettingId, {
    force: options.force ?? false,
    trigger: options.trigger ?? "scheduled",
  }).finally(() => refreshInFlight.delete(shopSettingId));
  refreshInFlight.set(shopSettingId, promise);
  return promise;
}

export async function refreshDueShopeeTokens(options: {
  force?: boolean;
  shopId?: string;
  trigger?: ShopeeTokenRefreshTrigger;
} = {}) {
  const shops = await prisma.shopeeShopSetting.findMany({
    where: {
      status: "active",
      ...(options.shopId ? { shopId: options.shopId } : {}),
      appConfig: { status: "active" },
    },
    select: { id: true, tokenExpireAt: true },
    orderBy: { updatedAt: "asc" },
  });
  const due = options.force
    ? shops
    : shops.filter((shop) => isShopeeTokenRefreshDue(shop.tokenExpireAt));
  const results: ShopeeTokenRefreshResult[] = [];
  for (const shop of due) {
    results.push(await refreshShopeeShopToken(shop.id, {
      force: options.force,
      trigger: options.trigger,
    }));
  }
  return {
    checked: shops.length,
    due: due.length,
    refreshed: results.filter((result) => result.status === "refreshed").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
}
