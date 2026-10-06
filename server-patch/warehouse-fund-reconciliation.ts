import { Prisma, WarehouseFundEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordWarehouseFundEntry } from "@/lib/warehouse-funds";
import type { ProfitOrderDetailRow } from "@/lib/profit-report-types";

const DEBIT_SOURCE = "PROFIT_ORDER_FULFILLMENT";
const REVERSAL_SOURCE = "PROFIT_ORDER_FULFILLMENT_REVERSAL";
const WAREHOUSE_SHIPPED_STATUSES = new Set(["AWAITING_COLLECTION", "IN_TRANSIT", "DELIVERED", "COMPLETED"]);

type WarehouseFeeRow = Pick<ProfitOrderDetailRow, "orderId" | "createTime" | "warehouseId" | "warehouseName" | "warehouseFeeBreakdown" | "currency" | "status" | "isSampleOrder">;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function warehouseBusinessDate(date: Date, region: string | null | undefined): string {
  const timeZone = region === "US" ? "America/Denver" : region === "BR" ? "America/Sao_Paulo" : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isWarehouseShippedStatus(status: string | null | undefined) {
  return WAREHOUSE_SHIPPED_STATUSES.has(String(status || "").trim().toUpperCase());
}

/**
 * Writes one warehouse debit for one profit order. The source key is the
 * order ID, so report refreshes and sync retries cannot charge twice.
 */
export async function recordWarehouseFeeForProfitOrder(row: WarehouseFeeRow) {
  const breakdown = row.warehouseFeeBreakdown;
  if (!row.warehouseId || !breakdown || breakdown.total <= 0) {
    return { skipped: true, reason: "订单没有可扣的海外仓费用" };
  }
  const amount = Number(breakdown.total.toFixed(2));
  const isSampleOrder = Boolean(row.isSampleOrder);
  const orderLabel = isSampleOrder ? "达人免费样品订单" : "订单";
  const occurredAt = new Date(row.createTime);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { skipped: true, reason: "订单时间无效" };
  }

  return prisma.$transaction((tx) => recordWarehouseFundEntry(tx, {
    warehouseId: row.warehouseId!,
    currency: String(breakdown.currency || row.currency || "BRL").toUpperCase(),
    entryType: WarehouseFundEntryType.FULFILLMENT_DEBIT,
    amount: new Prisma.Decimal(-amount),
    sourceType: DEBIT_SOURCE,
    sourceId: row.orderId,
    orderId: row.orderId,
    occurredAt,
    allowNegativeBalance: true,
    createdBy: "profit-reconciliation",
    notes: `${orderLabel} ${row.orderId} 海外仓代发扣费：HQ-订单出库费 ${breakdown.orderOutbound.toFixed(2)} + HQ-包材费 ${breakdown.packaging.toFixed(2)}${breakdown.oversize > 0 ? ` + 超尺寸费 ${breakdown.oversize.toFixed(2)}` : ""}`,
    details: json({
      orderId: row.orderId,
      orderKind: isSampleOrder ? "INFLUENCER_FREE_SAMPLE" : "SALES_ORDER",
      isSampleOrder,
      warehouseName: row.warehouseName,
      ruleId: breakdown.ruleId,
      currency: breakdown.currency,
      orderOutbound: Number(breakdown.orderOutbound.toFixed(2)),
      packaging: Number(breakdown.packaging.toFixed(2)),
      oversize: Number(breakdown.oversize.toFixed(2)),
      total: amount,
      billedUnits: breakdown.billedUnits,
      distinctSkuCount: breakdown.distinctSkuCount,
      chargeableWeightKg: breakdown.chargeableWeightKg,
      packageDimensions: breakdown.packageDimensions,
      tier: breakdown.tier,
    }),
  }));
}

/** Reverses an existing debit exactly once when an order is cancelled. */
export async function reverseWarehouseFeeForOrder(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const original = await tx.warehouseFundEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: DEBIT_SOURCE, sourceId: orderId } },
      select: { id: true, warehouseId: true, currency: true, amount: true, orderId: true, details: true },
    });
    if (!original) return { skipped: true, reason: "订单没有已记录的仓库扣费" };

    return recordWarehouseFundEntry(tx, {
      warehouseId: original.warehouseId,
      currency: original.currency,
      entryType: WarehouseFundEntryType.REVERSAL,
      amount: new Prisma.Decimal(original.amount).abs(),
      sourceType: REVERSAL_SOURCE,
      sourceId: orderId,
      orderId,
      allowNegativeBalance: true,
      createdBy: "profit-reconciliation",
      notes: `订单 ${orderId} 取消，冲正海外仓代发扣费`,
      details: json({ originalEntryId: original.id, originalDetails: original.details, reason: "ORDER_CANCELLED" }),
    });
  });
}

export async function reconcileWarehouseFees(rows: WarehouseFeeRow[]) {
  const results: Array<{ orderId: string; status: "deducted" | "duplicate" | "skipped" | "error"; amount?: number; reason?: string }> = [];
  for (const row of rows) {
    try {
      const result: any = await recordWarehouseFeeForProfitOrder(row);
      if (result.skipped) results.push({ orderId: row.orderId, status: "skipped", reason: result.reason });
      else results.push({ orderId: row.orderId, status: result.duplicated ? "duplicate" : "deducted", amount: Number(row.warehouseFeeBreakdown?.total || 0) });
    } catch (error: any) {
      results.push({ orderId: row.orderId, status: "error", reason: error?.message || "扣费失败" });
    }
  }
  return {
    total: results.length,
    deducted: results.filter((row) => row.status === "deducted").length,
    duplicate: results.filter((row) => row.status === "duplicate").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    errors: results.filter((row) => row.status === "error").length,
    results,
  };
}

/** Reconcile shipped orders for one shop/date using the read-only profit report. */
export async function reconcileWarehouseFeesForDate(origin: string, date: string, shopId: string) {
  const params = new URLSearchParams({ startDate: date, endDate: date, groupBy: "day", includeOrders: "1", shopId, autoWarehouseDebit: "0" });
  const response = await fetch(`${origin}/api/profit-report?${params.toString()}`, { cache: "no-store" });
  const report = await response.json();
  if (!response.ok) throw new Error(report?.error || `${date} 仓库扣费读取利润核算失败`);
  const orders = Array.isArray(report?.orders) ? report.orders as WarehouseFeeRow[] : [];
  const result = await reconcileWarehouseFees(orders.filter((row) => isWarehouseShippedStatus(row.status)));
  let reversed = 0;
  for (const row of orders.filter((item) => String(item.status).toUpperCase() === "CANCELLED")) {
    const reversal = await reverseWarehouseFeeForOrder(row.orderId);
    if (!(reversal as any).skipped) reversed += 1;
  }
  return { orders: orders.length, deducted: result.deducted, duplicate: result.duplicate, skipped: result.skipped, errors: result.errors, reversed };
}

export async function reconcileWarehouseFeeForOrder(origin: string, orderId: string, shopId: string, createTime: Date | null | undefined, region: string | null | undefined) {
  if (!createTime || !Number.isFinite(createTime.getTime())) return { orderId, deducted: 0, duplicate: 0, reversed: 0, errors: 0, skipped: 1, reason: "订单时间无效" };
  const date = warehouseBusinessDate(createTime, region);
  return { ...(await reconcileWarehouseFeesForDate(origin, date, shopId)), orderId, date };
}

/**
 * A free sample does not count toward store profit, but it uses warehouse
 * fulfillment. This uses the same daily order calculation as profit reporting
 * and only writes rows marked as samples.
 */
export async function reconcileSampleWarehouseFeesForDate(origin: string, date: string, shopId: string) {
  const params = new URLSearchParams({ startDate: date, endDate: date, groupBy: "day", includeOrders: "1", shopId });
  const response = await fetch(`${origin}/api/profit-report?${params.toString()}`, { cache: "no-store" });
  const report = await response.json();
  if (!response.ok) throw new Error(report?.error || `${date} 样品仓库扣费读取失败`);

  const orders = Array.isArray(report?.orders) ? report.orders as WarehouseFeeRow[] : [];
  const samples = orders.filter((row) => row.isSampleOrder);
  const activeSamples = samples.filter((row) => !["CANCELLED", "UNPAID"].includes(row.status));
  const result = await reconcileWarehouseFees(activeSamples);
  let reversed = 0;
  for (const row of samples.filter((item) => item.status === "CANCELLED")) {
    const reversal = await reverseWarehouseFeeForOrder(row.orderId);
    if (!(reversal as any).skipped) reversed += 1;
  }
  return { samples: samples.length, deducted: result.deducted, duplicate: result.duplicate, skipped: result.skipped, errors: result.errors, reversed };
}
