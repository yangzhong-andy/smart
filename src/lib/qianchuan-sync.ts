import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncAdvertisingMonthlyBills } from "@/lib/auto-generate-bills";
import { clearCacheByPrefix } from "@/lib/redis";
import { addBusinessDays, isBusinessDate, relativeBusinessDate } from "@/lib/order-business-time";
import { getQianchuanAdvertTotal, normalizeQianchuanAdvertTotal } from "@/lib/qianchuan-api";

const MAX_SYNC_DAYS = 90;

type SyncOptions = {
  connectionId?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
};

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error || "千川广告数据同步失败"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function cleanJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function externalIds(values: string[]): Array<string | number> {
  return values.map((value) => {
    const trimmed = value.trim();
    const number = Number(trimmed);
    return /^\d+$/.test(trimmed) && Number.isSafeInteger(number) ? number : trimmed;
  }).filter((value) => value !== "");
}

function syncRange(options: SyncOptions) {
  const endDate = options.endDate || relativeBusinessDate("CN");
  const days = Math.min(MAX_SYNC_DAYS, Math.max(1, Math.trunc(Number(options.days) || 7)));
  const startDate = options.startDate || addBusinessDays(endDate, -(days - 1));
  if (!isBusinessDate(startDate) || !isBusinessDate(endDate) || startDate > endDate) {
    throw new Error("千川广告同步日期范围无效");
  }
  const daySpan = Math.floor(
    (new Date(`${endDate}T00:00:00.000Z`).getTime() - new Date(`${startDate}T00:00:00.000Z`).getTime()) / 86_400_000,
  ) + 1;
  if (daySpan > MAX_SYNC_DAYS) throw new Error(`千川广告单次最多同步 ${MAX_SYNC_DAYS} 天`);
  return { startDate, endDate, daySpan };
}

export function qianchuanConsumptionDedupKey(connectionId: string, date: string) {
  return `qianchuan:${connectionId}:${date}`;
}

async function syncConnection(connectionId: string, range: ReturnType<typeof syncRange>) {
  const connection = await prisma.qianchuanConnection.findUnique({
    where: { id: connectionId },
    include: {
      adAccount: {
        include: { agency: true },
      },
    },
  });
  if (!connection || !connection.enabled) throw new Error("千川广告连接不存在或已停用");

  try {
    const response = await getQianchuanAdvertTotal({
      startDate: range.startDate,
      endDate: range.endDate,
      groupIds: externalIds(connection.externalGroupIds),
      userIds: externalIds(connection.externalUserIds),
      type: connection.reportType,
      categoryId: connection.categoryId,
    });
    const rows = normalizeQianchuanAdvertTotal(response, range.startDate, range.endDate);
    const storeId = connection.adAccount.storeIds.length === 1 ? connection.adAccount.storeIds[0] : null;
    const store = storeId
      ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } })
      : null;
    const now = new Date();
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    const months = new Set<string>();

    for (const row of rows) {
      const date = new Date(`${row.date}T00:00:00.000Z`);
      const dailyData = {
        spend: row.spend === null ? null : String(Math.max(0, row.spend)),
        conversions: row.conversions,
        attributedRevenue: row.attributedRevenue === null ? null : String(Math.max(0, row.attributedRevenue)),
        roi: row.roi === null ? null : String(row.roi),
        adCount: row.adCount,
        rawData: cleanJson(row.rawData),
        syncedAt: now,
      };
      operations.push(prisma.qianchuanDailyMetric.upsert({
        where: { connectionId_date: { connectionId: connection.id, date } },
        create: { connectionId: connection.id, date, ...dailyData },
        update: dailyData,
      }));

      // 只有 API 明确返回消耗时才写利润核算；缺失值不能伪装成 0。
      if (row.spend !== null) {
        const month = row.date.slice(0, 7);
        months.add(month);
        const consumptionData = {
          accountName: connection.adAccount.accountName,
          agencyId: connection.adAccount.agencyId,
          agencyName: connection.adAccount.agencyName || connection.adAccount.agency.name,
          storeId: store?.id || null,
          storeName: store?.name || null,
          month,
          date,
          amount: String(Math.max(0, row.spend)),
          currency: connection.currency || connection.adAccount.currency || "CNY",
          campaignName: "千川全部广告",
          campaignId: `qianchuan:${connection.id}`,
          consumptionType: "QIANCHUAN_API",
          notes: "千川 API 自动同步",
        };
        operations.push(prisma.adConsumption.upsert({
          where: { dedup_key: qianchuanConsumptionDedupKey(connection.id, row.date) },
          create: {
            adAccountId: connection.adAccountId,
            dedup_key: qianchuanConsumptionDedupKey(connection.id, row.date),
            ...consumptionData,
          },
          update: consumptionData,
        }));
      }
    }
    if (operations.length) await prisma.$transaction(operations);
    await prisma.qianchuanConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: now, lastSyncError: null },
    });
    return {
      connectionId: connection.id,
      connectionName: connection.name,
      adAccountId: connection.adAccountId,
      adAccountName: connection.adAccount.accountName,
      rows: rows.length,
      consumptionRows: rows.filter((row) => row.spend !== null).length,
      storeBinding: store ? { id: store.id, name: store.name } : null,
      ambiguousStoreBinding: connection.adAccount.storeIds.length > 1,
      months: [...months],
    };
  } catch (error) {
    const message = errorMessage(error);
    await prisma.qianchuanConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), lastSyncError: message },
    }).catch(() => undefined);
    throw new Error(message);
  }
}

export async function syncQianchuanAdvertising(options: SyncOptions = {}) {
  const range = syncRange(options);
  const connections = await prisma.qianchuanConnection.findMany({
    where: { enabled: true, ...(options.connectionId ? { id: options.connectionId } : {}) },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (options.connectionId && !connections.length) throw new Error("指定的千川广告连接不存在或已停用");

  const results: Array<Awaited<ReturnType<typeof syncConnection>>> = [];
  const errors: Array<{ connectionId: string; error: string }> = [];
  const affectedMonths = new Set<string>();
  for (const connection of connections) {
    try {
      const result = await syncConnection(connection.id, range);
      results.push(result);
      result.months.forEach((month) => affectedMonths.add(month));
    } catch (error) {
      errors.push({ connectionId: connection.id, error: errorMessage(error) });
    }
  }

  let billSync: unknown = null;
  let billSyncError: string | null = null;
  if (affectedMonths.size) {
    await Promise.all([
      clearCacheByPrefix("ad-consumptions"),
      clearCacheByPrefix("profit-report"),
      clearCacheByPrefix("tiktok-analytics"),
    ]);
    try {
      billSync = await syncAdvertisingMonthlyBills([...affectedMonths]);
    } catch (error) {
      billSyncError = errorMessage(error);
    }
  }

  return {
    ...range,
    connections: connections.length,
    results,
    errors,
    affectedMonths: [...affectedMonths].sort(),
    billSync,
    billSyncError,
  };
}
