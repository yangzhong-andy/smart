import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import {
  syncLogisticsMonthlyBills,
  syncSupplierMonthlyBills,
} from "@/lib/monthly-bill-sync";

type AdvertisingBillSyncResult = {
  created: number;
  updated: number;
  skippedLocked: number;
  months: string[];
};

type AdvertisingGroup = {
  month: string;
  agencyId: string;
  agencyName: string;
  adAccountId: string | null;
  accountName: string;
  currency: string;
  totalAmount: number;
  rebateAmount: number;
  consumptionIds: string[];
  rebateRate: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const asNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const isSystemGeneratedBill = (bill: {
  createdBy: string;
  notes: string | null;
}) => {
  const text = `${bill.createdBy || ""} ${bill.notes || ""}`;
  return /系统|自动生成|鑷姩|绯荤粺|auto|system/i.test(text);
};

const normaliseMonths = (months?: string[]) =>
  Array.from(
    new Set(
      (months || [])
        .map((month) => String(month).trim())
        .filter((month) => /^\d{4}-\d{2}$/.test(month)),
    ),
  );

/**
 * Rebuild advertising payable and rebate receivable bills from the source rows.
 * Only Draft system-generated bills are changed; submitted/approved/paid bills
 * remain historical records and are never overwritten by a backfill.
 */
export async function syncAdvertisingMonthlyBills(
  requestedMonths?: string[],
): Promise<AdvertisingBillSyncResult> {
  const months = normaliseMonths(requestedMonths);
  const consumptions = await prisma.adConsumption.findMany({
    where: months.length ? { month: { in: months } } : undefined,
    select: {
      id: true,
      month: true,
      amount: true,
      currency: true,
      agencyId: true,
      agencyName: true,
      adAccountId: true,
      accountName: true,
      estimatedRebate: true,
      creditConsumption: true,
    },
    orderBy: [{ month: "asc" }, { date: "asc" }, { id: "asc" }],
  });

  const agencyIds = Array.from(
    new Set(consumptions.map((row) => row.agencyId).filter((id): id is string => Boolean(id))),
  );
  const agencies = agencyIds.length
    ? await prisma.adAgency.findMany({
        where: { id: { in: agencyIds } },
        select: { id: true, rebateRate: true },
      })
    : [];
  const rebateRates = new Map(agencies.map((agency) => [agency.id, asNumber(agency.rebateRate)]));

  const targetMonths = months.length
    ? months
    : Array.from(new Set(consumptions.map((row) => row.month))).sort();
  if (targetMonths.length === 0) {
    return { created: 0, updated: 0, skippedLocked: 0, months: months.sort() };
  }

  const groups = new Map<string, AdvertisingGroup>();
  for (const row of consumptions) {
    if (!row.agencyId) continue;
    const key = [
      row.month,
      row.agencyId,
      row.currency,
    ].join("\u0000");
    const baseAmount = asNumber(row.creditConsumption ?? row.amount);
    const configuredRate = rebateRates.get(row.agencyId) || 0;
    const rebate = row.estimatedRebate == null
      ? (baseAmount * configuredRate) / 100
      : asNumber(row.estimatedRebate);
    const existing = groups.get(key);
    if (existing) {
      existing.totalAmount += baseAmount;
      existing.rebateAmount += rebate;
      existing.consumptionIds.push(row.id);
    } else {
      groups.set(key, {
        month: row.month,
        agencyId: row.agencyId,
        agencyName: row.agencyName || "",
        // A monthly bill belongs to the associated agency, not to an
        // individual advertising account. Account-level rows are merged.
        adAccountId: null,
        accountName: "",
        currency: row.currency || "USD",
        totalAmount: baseAmount,
        rebateAmount: rebate,
        consumptionIds: [row.id],
        rebateRate: configuredRate,
      });
    }
  }

  const existingBills = await prisma.monthlyBill.findMany({
    where: {
      billType: { in: ["广告", "广告返点"] },
      month: { in: targetMonths },
    },
    orderBy: { createdAt: "asc" },
  });
  let created = 0;
  let updated = 0;
  let skippedLocked = 0;
  let cacheDirty = false;
  const matchedBillIds = new Set<string>();

  const findBills = (group: AdvertisingGroup, billType: string) =>
    existingBills.filter(
      (bill) =>
        bill.billType === billType &&
        bill.month === group.month &&
        bill.agencyId === group.agencyId &&
        bill.currency === group.currency,
    );

  for (const group of groups.values()) {
    const totalAmount = roundMoney(group.totalAmount);
    const rebateAmount = roundMoney(Math.max(0, group.rebateAmount));
    const netAmount = roundMoney(Math.max(0, totalAmount - rebateAmount));
    const ids = JSON.stringify(group.consumptionIds);
    const billData = {
      month: group.month,
      billCategory: "Payable",
      billType: "广告",
      agencyId: group.agencyId,
      agencyName: group.agencyName,
      adAccountId: group.adAccountId,
      accountName: group.accountName,
      totalAmount,
      currency: group.currency,
      rebateAmount,
      netAmount,
      consumptionIds: ids,
      rebateRate: group.rebateRate,
      status: "Draft",
      createdBy: "系统自动生成",
      notes: `信用消耗账单（${group.month}）- 自动生成`,
    } as const;
    const rebateData = {
      ...billData,
      billCategory: "Receivable",
      billType: "广告返点",
      totalAmount,
      netAmount: rebateAmount,
      notes: `返点应收账单（${group.month}）- 自动生成`,
    } as const;

    for (const [billType, data] of [
      ["广告", billData],
      ["广告返点", rebateData],
    ] as const) {
      if (billType === "广告返点" && rebateAmount <= 0) continue;
      const candidates = findBills(group, billType);
      const existing = candidates.find(
        (bill) => bill.status === "Draft" && isSystemGeneratedBill(bill),
      );
      if (existing) {
        if (
          existing.status !== "Draft" ||
          !isSystemGeneratedBill(existing)
        ) {
          skippedLocked += 1;
          continue;
        }
        await prisma.monthlyBill.update({
          where: { id: existing.id },
          data: {
            agencyName: data.agencyName,
            adAccountId: null,
            accountName: null,
            totalAmount: data.totalAmount,
            currency: data.currency,
            rebateAmount: data.rebateAmount,
            netAmount: data.netAmount,
            consumptionIds: data.consumptionIds,
            rebateRate: data.rebateRate,
            notes: data.notes,
            updatedAt: new Date(),
          },
        });
        matchedBillIds.add(existing.id);
        for (const duplicate of candidates) {
          if (
            duplicate.id !== existing.id &&
            duplicate.status === "Draft" &&
            isSystemGeneratedBill(duplicate)
          ) {
            await prisma.monthlyBill.delete({ where: { id: duplicate.id } });
            matchedBillIds.add(duplicate.id);
            updated += 1;
            cacheDirty = true;
          }
        }
        updated += 1;
        cacheDirty = true;
      } else {
        await prisma.monthlyBill.create({ data });
        created += 1;
        cacheDirty = true;
      }
    }
  }

  // If the last source row was edited or deleted, clear its generated Draft
  // bill instead of leaving a stale amount visible in monthly-bill management.
  for (const bill of existingBills) {
    if (
      !targetMonths.includes(bill.month) ||
      matchedBillIds.has(bill.id) ||
      bill.status !== "Draft" ||
      !isSystemGeneratedBill(bill)
    ) {
      continue;
    }
    await prisma.monthlyBill.update({
      where: { id: bill.id },
      data: {
        totalAmount: 0,
        rebateAmount: 0,
        netAmount: 0,
        consumptionIds: "[]",
        notes: `系统自动重算：${bill.month} 当前无广告消耗`,
        updatedAt: new Date(),
      },
    });
    updated += 1;
    cacheDirty = true;
  }

  if (cacheDirty) await clearCacheByPrefix("monthly-bills");
  return { created, updated, skippedLocked, months: targetMonths };
}

export async function autoGenerateSupplierBills(): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  const result = await syncSupplierMonthlyBills();
  return {
    created: result.created,
    updated: result.updated + result.cleared,
    skipped: result.skippedLocked,
  };
}

/** Backwards-compatible single-month entry point used by older callers. */
export async function generateAdConsumptionBills(month?: string) {
  const result = await syncAdvertisingMonthlyBills(month ? [month] : undefined);
  return {
    month: month || result.months[0] || new Date().toISOString().slice(0, 7),
    created: result.created,
    updated: result.updated,
    skippedLocked: result.skippedLocked,
    total: result.months.length,
  };
}

/**
 * Unified idempotent backfill for every derived monthly bill category.
 * Source transactions are read-only; only generated Draft bills are reconciled.
 */
export async function syncAllMonthlyBills(requestedMonths?: string[]) {
  const advertising = await syncAdvertisingMonthlyBills(requestedMonths);
  const supplier = await syncSupplierMonthlyBills();
  const logistics = await syncLogisticsMonthlyBills();
  return { advertising, supplier, logistics };
}
