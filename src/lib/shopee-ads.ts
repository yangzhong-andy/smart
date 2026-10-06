import { addBusinessDays } from "@/lib/order-business-time";
import { allocateMoneyByWeight } from "@/lib/money-allocation";
import { shopeeShopGet } from "@/lib/shopee-open-api";
import { withFreshShopeeToken } from "@/lib/shopee-order-sync";

export type ShopeeDailyAdPerformance = {
  date: string;
  expense: number;
  broadGmv: number;
  broadOrders: number;
  broadItemSold: number;
  impressions: number;
  clicks: number;
  broadRoas: number;
};

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Allocate one day's official advertising spend evenly across its eligible orders.
 * A remainder cent is assigned deterministically so the order-level total still
 * equals the shop/day advertising total.
 */
export function allocateShopeeAdExpenseByOrderCount(total: number, orderCount: number) {
  const count = Math.trunc(Number(orderCount));
  if (!Number.isFinite(count) || count <= 0) return [];
  return allocateMoneyByWeight(total, Array.from({ length: count }, () => 1));
}

export function shopeeAdsApiDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

export function normalizeShopeeAdsDate(value: unknown) {
  const raw = String(value || "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const regional = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  return regional ? `${regional[3]}-${regional[2]}-${regional[1]}` : null;
}

export function shopeeAdsDateChunks(startDate: string, endDate: string) {
  const chunks: Array<{ startDate: string; endDate: string }> = [];
  for (let cursor = startDate; cursor <= endDate;) {
    // Shopee counts both boundary dates, so an offset of 29 is a 30-day request.
    const chunkEnd = [addBusinessDays(cursor, 29), endDate].sort()[0];
    chunks.push({ startDate: cursor, endDate: chunkEnd });
    cursor = addBusinessDays(chunkEnd, 1);
  }
  return chunks;
}

export async function getShopeeDailyAdPerformance(shopSettingId: string, startDate: string, endDate: string) {
  // Shopee requires at least two calendar days even when a daily profit dialog
  // requests one date. Fetch the preceding date and filter it back out.
  const queryStart = startDate === endDate ? addBusinessDays(startDate, -1) : startDate;
  const chunks = shopeeAdsDateChunks(queryStart, endDate);
  const rawRows = await withFreshShopeeToken(shopSettingId, async (credentials) => {
    const results: Record<string, unknown>[] = [];
    for (const chunk of chunks) {
      const rows = await shopeeShopGet<Record<string, unknown>[]>(
        credentials,
        "/api/v2/ads/get_all_cpc_ads_daily_performance",
        { start_date: shopeeAdsApiDate(chunk.startDate), end_date: shopeeAdsApiDate(chunk.endDate) },
      );
      results.push(...(rows || []));
    }
    return results;
  });
  const byDate = new Map<string, ShopeeDailyAdPerformance>();
  for (const row of rawRows) {
    const date = normalizeShopeeAdsDate(row.date);
    if (!date || date < startDate || date > endDate) continue;
    const current = byDate.get(date) || {
      date,
      expense: 0,
      broadGmv: 0,
      broadOrders: 0,
      broadItemSold: 0,
      impressions: 0,
      clicks: 0,
      broadRoas: 0,
    };
    current.expense += decimal(row.expense);
    current.broadGmv += decimal(row.broad_gmv);
    current.broadOrders += decimal(row.broad_order);
    current.broadItemSold += decimal(row.broad_item_sold);
    current.impressions += decimal(row.impression);
    current.clicks += decimal(row.clicks);
    byDate.set(date, current);
  }
  return [...byDate.values()]
    .map((row) => ({ ...row, broadRoas: row.expense > 0 ? row.broadGmv / row.expense : 0 }))
    .sort((left, right) => left.date.localeCompare(right.date));
}
