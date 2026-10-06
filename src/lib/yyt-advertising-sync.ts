import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getYytAdvertisingDay } from "@/lib/yyt-advertising";

const MAX_SYNC_DAYS = 120;

type SyncOptions = {
  startDate?: string;
  endDate?: string;
  days?: number;
};

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function todayInShanghai(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function syncRange(options: SyncOptions) {
  const endDate = options.endDate || todayInShanghai();
  const days = Math.min(MAX_SYNC_DAYS, Math.max(1, Math.trunc(Number(options.days) || 7)));
  const startDate = options.startDate || addDays(endDate, -(days - 1));
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new Error("YYT 同步日期范围无效");
  const daySpan = Math.floor((new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000) + 1;
  if (daySpan > MAX_SYNC_DAYS) throw new Error(`YYT 单次最多同步 ${MAX_SYNC_DAYS} 天`);
  return { startDate, endDate, daySpan };
}

function cleanJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export async function syncYytAdvertising(options: SyncOptions = {}) {
  const range = syncRange(options);
  const currency = (process.env.YYT_ADVERTISING_CURRENCY || "USD").trim().toUpperCase();
  const results: Array<{ date: string; rows: number; requestId: string | null }> = [];
  const errors: Array<{ date: string; error: string }> = [];

  for (let date = range.startDate; date <= range.endDate; date = addDays(date, 1)) {
    try {
      const response = await getYytAdvertisingDay(date);
      const syncedAt = new Date();
      if (response.rows.length) {
        await prisma.$transaction(response.rows.map((row) => {
          const values = {
            advertiserName: row.advertiserName,
            currency,
            cost: String(row.cost),
            orders: row.orders,
            grossRevenue: String(row.grossRevenue),
            costPerOrder: String(row.costPerOrder),
            roi: String(row.roi),
            productImpressions: row.productImpressions,
            productClicks: row.productClicks,
            adConversion: row.adConversion,
            adConversionRate: String(row.adConversionRate),
            diggCount: row.diggCount,
            collectCount: row.collectCount,
            shareCount: row.shareCount,
            commentCount: row.commentCount,
            playCount: row.playCount,
            productAvgPrice: String(row.productAvgPrice),
            productPieceNum: String(row.productPieceNum),
            itemNum: row.itemNum,
            authorizationDate: row.authorizationDate ? new Date(`${row.authorizationDate}T00:00:00.000Z`) : null,
            relationName: row.relationName,
            categoryNames: row.categoryNames,
            rawData: cleanJson(row.rawData),
            sourceRequestId: response.requestId,
            syncedAt,
          };
          return prisma.yytAdvertisingDaily.upsert({
            where: { date_advertiserId: { date: new Date(`${date}T00:00:00.000Z`), advertiserId: row.advertiserId } },
            create: { date: new Date(`${date}T00:00:00.000Z`), advertiserId: row.advertiserId, ...values },
            update: values,
          });
        }));
      }
      results.push({ date, rows: response.rows.length, requestId: response.requestId });
    } catch (error) {
      errors.push({
        date,
        error: (error instanceof Error ? error.message : String(error || "YYT 同步失败")).replace(/\s+/g, " ").slice(0, 500),
      });
    }
  }
  return {
    ...range,
    success: errors.length === 0,
    syncedDays: results.length,
    syncedRows: results.reduce((sum, item) => sum + item.rows, 0),
    results,
    errors,
  };
}
