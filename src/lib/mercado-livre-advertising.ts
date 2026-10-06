import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMercadoLivreAdvertisingAdvertisers,
  searchMercadoLivreAdvertisingDailyMetrics,
  type MercadoLivreAdvertisingAdvertiser,
  type MercadoLivreAdvertisingDailyMetric,
} from "@/lib/mercado-livre-api";
import { addBusinessDays, isBusinessDate, relativeBusinessDate } from "@/lib/order-business-time";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";

const PRODUCT_ID = "PADS";
const MAX_DAYS = 90;

type SyncRange = { startDate?: string; endDate?: string; days?: number };

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown): number {
  return Math.max(0, Math.trunc(numberValue(value) || 0));
}

function decimalValue(value: unknown): string | null {
  const parsed = numberValue(value);
  return parsed === null ? null : String(parsed);
}

// Mercado Ads returns percentage metrics as 3.77 for 3.77%. Store a ratio so
// the UI can use the same percentage formatting as the other analytics data.
function percentageRatio(value: unknown): string | null {
  const parsed = numberValue(value);
  return parsed === null ? null : (parsed / 100).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function json(value: unknown): Prisma.InputJsonValue {
  return (value && typeof value === "object" ? value : {}) as Prisma.InputJsonValue;
}

function metricDate(value: unknown): string | null {
  const result = text(value)?.slice(0, 10) || null;
  return result && isBusinessDate(result) ? result : null;
}

function normalizedAdvertiser(raw: MercadoLivreAdvertisingAdvertiser, accountId: string) {
  const advertiserId = text(raw.advertiser_id);
  if (!advertiserId) return null;
  return {
    accountId,
    advertiserId,
    productId: PRODUCT_ID,
    siteId: text(raw.site_id) || "MLB",
    advertiserName: text(raw.advertiser_name),
    accountName: text(raw.account_name),
    status: "active",
    lastSyncError: null,
  };
}

export function normalizeMercadoLivreAdvertisingMetric(raw: MercadoLivreAdvertisingDailyMetric, advertisingAccountId: string) {
  const date = metricDate(raw.date);
  if (!date) return null;
  return {
    advertisingAccountId,
    date: new Date(`${date}T00:00:00.000Z`),
    clicks: integerValue(raw.clicks),
    prints: integerValue(raw.prints),
    ctr: percentageRatio(raw.ctr),
    cost: decimalValue(raw.cost),
    cpc: decimalValue(raw.cpc),
    acos: percentageRatio(raw.acos),
    roas: decimalValue(raw.roas),
    tacos: percentageRatio(raw.tacos),
    cvr: percentageRatio(raw.cvr),
    directAmount: decimalValue(raw.direct_amount),
    indirectAmount: decimalValue(raw.indirect_amount),
    totalAmount: decimalValue(raw.total_amount),
    directUnitsQuantity: integerValue(raw.direct_units_quantity),
    indirectUnitsQuantity: integerValue(raw.indirect_units_quantity),
    unitsQuantity: integerValue(raw.units_quantity),
    organicUnitsQuantity: integerValue(raw.organic_units_quantity),
    advertisingItemsQuantity: integerValue(raw.advertising_items_quantity),
    directItemsQuantity: integerValue(raw.direct_items_quantity),
    indirectItemsQuantity: integerValue(raw.indirect_items_quantity),
    organicItemsQuantity: integerValue(raw.organic_items_quantity),
    organicUnitsAmount: decimalValue(raw.organic_units_amount),
    organicItemsAmount: decimalValue(raw.organic_items_amount),
    impressionShare: percentageRatio(raw.impression_share ?? raw.sov),
    rawData: json(raw),
    syncedAt: new Date(),
  };
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "广告数据同步失败"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function rangeForAccount(country: string, range: SyncRange) {
  const endDate = range.endDate || relativeBusinessDate(country || "BR");
  const days = Math.min(MAX_DAYS, Math.max(1, Math.trunc(Number(range.days) || 7)));
  const startDate = range.startDate || addBusinessDays(endDate, -(days - 1));
  if (!isBusinessDate(startDate) || !isBusinessDate(endDate) || startDate > endDate) {
    throw new Error("广告同步日期范围无效");
  }
  const daySpan = Math.floor((new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  if (daySpan > MAX_DAYS) throw new Error("Mercado Ads 单次最多同步 90 天");
  return { startDate, endDate, daySpan };
}

async function saveAdvertiserMetrics(
  advertisingAccountId: string,
  rows: MercadoLivreAdvertisingDailyMetric[],
) {
  const normalized = rows
    .map((row) => normalizeMercadoLivreAdvertisingMetric(row, advertisingAccountId))
    .filter((row): row is NonNullable<ReturnType<typeof normalizeMercadoLivreAdvertisingMetric>> => Boolean(row));
  if (!normalized.length) return 0;
  await prisma.$transaction(
    normalized.map((row) => prisma.mercadoLivreAdvertisingDaily.upsert({
      where: { advertisingAccountId_date: { advertisingAccountId, date: row.date } },
      create: row,
      update: row,
    })),
  );
  return normalized.length;
}

async function syncAccount(accountId: string, range: SyncRange) {
  const account = await prisma.mercadoLivreAccount.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true, siteId: true, country: true, status: true },
  });
  if (!account || account.status !== "active") throw new Error("Mercado Livre 授权账号不存在或未连接");
  const dateRange = rangeForAccount(account.country || "BR", range);

  const advertisersResponse = await withFreshMercadoLivreToken(account.id, (token) =>
    getMercadoLivreAdvertisingAdvertisers(token, PRODUCT_ID));
  const advertisers = (Array.isArray(advertisersResponse.advertisers) ? advertisersResponse.advertisers : [])
    .map((raw) => normalizedAdvertiser(raw, account.id))
    .filter((item): item is NonNullable<ReturnType<typeof normalizedAdvertiser>> => Boolean(item))
    .filter((item) => item.siteId.toUpperCase() === (account.siteId || "MLB").toUpperCase());

  if (!advertisers.length) {
    return {
      accountId: account.id,
      userId: account.userId,
      ...dateRange,
      advertisers: 0,
      metricRows: 0,
      warnings: ["Mercado Ads 尚未返回当前店铺的 Product Ads 广告主"],
    };
  }

  let metricRows = 0;
  const results: Array<{ advertiserId: string; rows: number }> = [];
  for (const advertiser of advertisers) {
    const savedAdvertiser = await prisma.mercadoLivreAdvertisingAccount.upsert({
      where: {
        accountId_advertiserId_productId: {
          accountId: account.id,
          advertiserId: advertiser.advertiserId,
          productId: PRODUCT_ID,
        },
      },
      create: advertiser,
      update: advertiser,
      select: { id: true },
    });
    try {
      const response = await withFreshMercadoLivreToken(account.id, (token) =>
        searchMercadoLivreAdvertisingDailyMetrics(token, advertiser.siteId, advertiser.advertiserId, {
          dateFrom: dateRange.startDate,
          dateTo: dateRange.endDate,
        }));
      const saved = await saveAdvertiserMetrics(savedAdvertiser.id, Array.isArray(response.results) ? response.results : []);
      await prisma.mercadoLivreAdvertisingAccount.update({
        where: { id: savedAdvertiser.id },
        data: { status: "active", lastSyncAt: new Date(), lastSyncError: null },
      });
      metricRows += saved;
      results.push({ advertiserId: advertiser.advertiserId, rows: saved });
    } catch (error) {
      const message = errorMessage(error);
      await prisma.mercadoLivreAdvertisingAccount.update({
        where: { id: savedAdvertiser.id },
        data: { status: "error", lastSyncAt: new Date(), lastSyncError: message },
      });
      throw new Error(`广告主 ${advertiser.advertiserId} 同步失败：${message}`);
    }
  }

  return {
    accountId: account.id,
    userId: account.userId,
    ...dateRange,
    advertisers: advertisers.length,
    metricRows,
    results,
    warnings: [],
  };
}

export async function syncMercadoLivreAdvertising(input: SyncRange & { accountId?: string } = {}) {
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(input.accountId ? { id: input.accountId } : {}) },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const results: unknown[] = [];
  const errors: Array<{ accountId: string; error: string }> = [];
  for (const account of accounts) {
    try {
      results.push(await syncAccount(account.id, input));
    } catch (error) {
      errors.push({ accountId: account.id, error: errorMessage(error) });
    }
  }
  return { accounts: accounts.length, results, errors, maxDays: MAX_DAYS };
}
