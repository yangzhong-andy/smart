import { NextRequest, NextResponse } from "next/server";
import { WarehouseFundEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordWarehouseFundEntry } from "@/lib/warehouse-funds";
import { calculateWarehouseStorageForDate } from "@/lib/warehouse-storage";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(value: unknown) {
  const text = String(value || "").trim();
  if (!DATE.test(text)) return null;
  return new Date(`${text}T00:00:00.000Z`);
}

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + count);
  return next;
}

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const date = String(url.searchParams.get("date") || dateText(new Date()));
  const warehouseId = String(url.searchParams.get("warehouseId") || "").trim() || undefined;
  const target = dateOnly(date);
  if (!target) return NextResponse.json({ error: "日期格式应为 YYYY-MM-DD" }, { status: 400 });
  try {
    const report = await calculateWarehouseStorageForDate(target, warehouseId);
    const sourceIds = report.rows.map((row) => `${row.warehouseId}:${row.date}`);
    const applied = sourceIds.length
      ? await prisma.warehouseFundEntry.findMany({ where: { sourceType: "WAREHOUSE_STORAGE_DAILY", sourceId: { in: sourceIds } }, select: { warehouseId: true, sourceId: true, amount: true } })
      : [];
    return NextResponse.json({ ...report, applied: applied.map((entry) => ({ ...entry, amount: Number(entry.amount) })) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "仓储费试算失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const start = dateOnly(body?.startDate || dateText(new Date()));
    const end = dateOnly(body?.endDate || body?.startDate || dateText(new Date()));
    const warehouseId = String(body?.warehouseId || "").trim() || undefined;
    if (!start || !end || end < start) return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
    const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (dayCount > 31) return NextResponse.json({ error: "单次最多补记 31 天仓储费" }, { status: 400 });

    const results: Array<{ date: string; warehouseId: string; amount: number; duplicated: boolean }> = [];
    for (let index = 0; index < dayCount; index += 1) {
      const date = addDays(start, index);
      const report = await calculateWarehouseStorageForDate(date, warehouseId);
      const grouped = new Map<string, { warehouseId: string; warehouseName: string; currency: string; amount: number; rows: typeof report.rows }>();
      for (const row of report.rows.filter((item) => item.status === "CHARGEABLE" && item.amount > 0)) {
        const key = `${row.warehouseId}:${row.currency}`;
        const current = grouped.get(key) || { warehouseId: row.warehouseId, warehouseName: row.warehouseName, currency: row.currency, amount: 0, rows: [] };
        current.amount += row.amount;
        current.rows.push(row);
        grouped.set(key, current);
      }
      for (const group of grouped.values()) {
        const amount = Number(group.amount.toFixed(2));
        if (amount <= 0) continue;
        const sourceId = `${group.warehouseId}:${dateText(date)}`;
        const result = await prisma.$transaction((tx) => recordWarehouseFundEntry(tx, {
          warehouseId: group.warehouseId,
          currency: group.currency,
          entryType: WarehouseFundEntryType.STORAGE_DEBIT,
          amount: -amount,
          sourceType: "WAREHOUSE_STORAGE_DAILY",
          sourceId,
          occurredAt: addDays(date, 1),
          allowNegativeBalance: true,
          createdBy: "warehouse-storage-reconciliation",
          notes: `${group.warehouseName} 仓储费：${dateText(date)} 按超免仓期库存体积计费`,
          details: { date: dateText(date), rateUnit: "CBM_DAY", amount, rows: group.rows },
        }));
        results.push({ date: dateText(date), warehouseId: group.warehouseId, amount, duplicated: result.duplicated });
      }
    }
    return NextResponse.json({ success: true, results, added: results.filter((item) => !item.duplicated).length, duplicate: results.filter((item) => item.duplicated).length });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "仓储费扣记失败" }, { status: 500 });
  }
}
