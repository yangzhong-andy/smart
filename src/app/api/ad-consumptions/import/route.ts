import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { randomUUID } from "node:crypto";
import { syncAdvertisingMonthlyBills } from "@/lib/auto-generate-bills";

export const dynamic = "force-dynamic";

type ImportRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const records: ImportRecord[] = Array.isArray(body.records)
      ? body.records.filter((record: unknown): record is ImportRecord => Boolean(record && typeof record === "object"))
      : [];
    const clean = (value: unknown) =>
      String(value ?? "").replace(/\x00/g, "").replace(/[\u0000-\u001F]/g, "").trim();
    const cleanNumber = (value: unknown) => {
      const number = Number(clean(value));
      return Number.isFinite(number) ? Math.abs(number) : 0;
    };
    const adAccountId = clean(body.adAccountId);
    const accountName = clean(body.accountName) || null;
    const agencyId = clean(body.agencyId) || null;
    const agencyName = clean(body.agencyName) || null;
    const storeId = clean(body.storeId) || null;
    const storeName = clean(body.storeName) || null;

    if (records.length === 0) {
      return NextResponse.json({ error: "缺少消耗记录" }, { status: 400 });
    }
    if (!adAccountId) {
      return NextResponse.json({ error: "请选择广告账户" }, { status: 400 });
    }

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const batchSet = new Set<string>();

    for (const record of records) {
      try {
        const dateString = clean(record.date);
        const amount = cleanNumber(record.amount);
        const date = new Date(dateString);
        if (!dateString || amount <= 0 || Number.isNaN(date.getTime())) {
          skipped += 1;
          continue;
        }

        const dateOnly = dateString.slice(0, 10);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const campaignName = clean(record.campaignName) || null;
        const campaignId = clean(record.campaignId) || null;
        const currency = clean(record.currency) || "USD";
        const consumptionType = clean(record.consumptionType) || null;
        const cashConsumption = cleanNumber(record.cashConsumption) || null;
        const creditConsumption = cleanNumber(record.creditConsumption) || null;
        const giftConsumption = cleanNumber(record.giftConsumption) || null;
        const estimatedRebate = record.estimatedRebate == null
          ? null
          : cleanNumber(record.estimatedRebate);
        const rebateRate = record.rebateRate == null ? null : cleanNumber(record.rebateRate);
        const dedupKey = `${adAccountId}|${dateOnly}|${amount}|${campaignId || ""}`;
        if (batchSet.has(dedupKey)) {
          skipped += 1;
          continue;
        }
        batchSet.add(dedupKey);

        const id = randomUUID();
        const result: Array<{ id: string }> = await prisma.$queryRaw`
          INSERT INTO "AdConsumption"
          (id, "adAccountId", "accountName", "agencyId", "agencyName", "storeId", "storeName",
           month, date, amount, currency, "campaignName", "campaignId", "estimatedRebate", "rebateRate",
           "cashConsumption", "creditConsumption", "giftConsumption", "consumptionType",
           "isSettled", "createdAt", "updatedAt")
          VALUES
          (${id}, ${adAccountId}, ${accountName}, ${agencyId}, ${agencyName}, ${storeId}, ${storeName},
           ${month}, ${date}, ${amount}, ${currency}, ${campaignName}, ${campaignId}, ${estimatedRebate}, ${rebateRate},
           ${cashConsumption}, ${creditConsumption}, ${giftConsumption}, ${consumptionType},
           false, NOW(), NOW())
          ON CONFLICT (dedup_key) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) created += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        if (failed <= 3) {
          console.error("[ad-consumption-import] failed:", error instanceof Error ? error.message : String(error));
        }
      }
    }

    await clearCacheByPrefix("ad-consumptions");
    const affectedMonths = Array.from(
      new Set(
        records
          .map((record: ImportRecord) => new Date(clean(record.date)))
          .filter((date: Date) => !Number.isNaN(date.getTime()))
          .map((date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`),
      ),
    );
    const billSync = await syncAdvertisingMonthlyBills(affectedMonths);

    return NextResponse.json({
      success: true,
      created,
      skipped,
      failed,
      total: records.length,
      billSync,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "导入失败" }, { status: 500 });
  }
}
