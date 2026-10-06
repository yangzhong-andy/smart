import { Prisma, WarehouseFundEntryType } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import { prisma } from "@/lib/prisma";
import { getAuthSecret } from "@/lib/auth-secret";
import { recordWarehouseFundEntry } from "@/lib/warehouse-funds";
import type { ProfitOrderDetailRow } from "@/lib/profit-report-types";
import { getMercadoLivreShipment } from "@/lib/mercado-livre-api";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";

type LedgerPlatform = "TIKTOK" | "SHOPEE" | "MERCADO_LIVRE";

const PLATFORM_SOURCES: Record<LedgerPlatform, { debit: string; reversal: string }> = {
  // Keep the original TikTok keys so historical entries remain idempotent.
  TIKTOK: {
    debit: "PROFIT_ORDER_FULFILLMENT",
    reversal: "PROFIT_ORDER_FULFILLMENT_REVERSAL",
  },
  SHOPEE: {
    debit: "SHOPEE_PROFIT_ORDER_FULFILLMENT",
    reversal: "SHOPEE_PROFIT_ORDER_FULFILLMENT_REVERSAL",
  },
  MERCADO_LIVRE: {
    debit: "MERCADO_LIVRE_PROFIT_ORDER_FULFILLMENT",
    reversal: "MERCADO_LIVRE_PROFIT_ORDER_FULFILLMENT_REVERSAL",
  },
};

/**
 * The reconciliation helpers run inside the Next.js process. Calling the
 * public server address from that process is fragile (hairpin NAT, firewall,
 * or DNS can make it fail). Preserve the port from the request origin and use
 * the local loopback interface for the report read.
 */
function internalReportOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `http://127.0.0.1:${port}`;
  } catch {
    return origin;
  }
}

let internalReportUserId: string | null = null;

async function internalReportRequest(): Promise<RequestInit> {
  if (!internalReportUserId) {
    const user = await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!user) throw new Error("系统没有可用于读取利润报告的有效用户");
    internalReportUserId = user.id;
  }
  const token = jwt.sign(
    { userId: internalReportUserId },
    getAuthSecret(),
    { algorithm: "HS256", expiresIn: 60 },
  );
  return {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  };
}

// TikTok may report an order after it has already moved past AWAITING_COLLECTION.
// Once it reaches one of these states, warehouse fulfillment is considered shipped
// and the profit-report calculation can be posted to the warehouse ledger.
const WAREHOUSE_SHIPPED_STATUSES = new Set([
  "AWAITING_COLLECTION",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
]);

const SHOPEE_WAREHOUSE_SHIPPED_STATUSES = new Set([
  "READY_TO_SHIP",
  "PROCESSED",
  "SHIPPED",
  "TO_CONFIRM_RECEIVE",
  "COMPLETED",
]);

type WarehouseFeeRow = Pick<ProfitOrderDetailRow,
  "orderId" | "warehouseId" | "warehouseName" | "warehouseFeeBreakdown" | "currency" | "status"
> & {
  createTime: string | null;
  platform?: LedgerPlatform;
  shopId?: string | null;
  shopName?: string | null;
  storeName?: string | null;
  countryCode?: string | null;
  isSampleOrder?: boolean;
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function isWarehouseShippedStatus(status: string | null | undefined) {
  return WAREHOUSE_SHIPPED_STATUSES.has(String(status || "").trim().toUpperCase());
}

export function isShopeeWarehouseShippedStatus(status: string | null | undefined) {
  return SHOPEE_WAREHOUSE_SHIPPED_STATUSES.has(String(status || "").trim().toUpperCase());
}

/** Mercado Livre order statuses that prove the parcel has left fulfillment. */
export function isMercadoLivreWarehouseShippedStatus(status: string | null | undefined) {
  const normalized = String(status || "").trim().toUpperCase().replace(/-/g, "_");
  return new Set(["SHIPPED", "IN_TRANSIT", "DELIVERED", "NOT_DELIVERED", "COMPLETED"]).has(normalized);
}

export function warehouseBusinessDate(date: Date, region: string | null | undefined): string {
  const timeZone = region === "US"
    ? "America/Denver"
    : region === "BR"
      ? "America/Sao_Paulo"
      : "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const platform = row.platform || "TIKTOK";
  const sources = PLATFORM_SOURCES[platform];
  const isSampleOrder = Boolean(row.isSampleOrder);
  const orderKind = isSampleOrder ? "INFLUENCER_FREE_SAMPLE" : "SALES_ORDER";
  const orderLabel = isSampleOrder ? "达人免费样品订单" : "订单";
  if (!row.createTime) {
    return { skipped: true, reason: "订单时间无效" };
  }
  const occurredAt = new Date(row.createTime);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { skipped: true, reason: "订单时间无效" };
  }

  return prisma.$transaction((tx) => recordWarehouseFundEntry(tx, {
    warehouseId: row.warehouseId!,
    currency: String(breakdown.currency || row.currency || "BRL").toUpperCase(),
    entryType: WarehouseFundEntryType.FULFILLMENT_DEBIT,
    amount: new Prisma.Decimal(-amount),
    sourceType: sources.debit,
    sourceId: row.orderId,
    orderId: row.orderId,
    platform,
    shopId: row.shopId,
    shopName: row.shopName || row.storeName,
    countryCode: row.countryCode,
    occurredAt,
    allowNegativeBalance: true,
    createdBy: "profit-reconciliation",
    notes: `${orderLabel} ${row.orderId} 海外仓代发扣费：HQ-订单出库费 ${breakdown.orderOutbound.toFixed(2)} + HQ-包材费 ${breakdown.packaging.toFixed(2)}${breakdown.oversize > 0 ? ` + 超尺寸费 ${breakdown.oversize.toFixed(2)}` : ""}`,
    details: json({
      orderId: row.orderId,
      platform,
      shopId: row.shopId || null,
      shopName: row.shopName || row.storeName || null,
      countryCode: row.countryCode || null,
      orderKind,
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
export async function reverseWarehouseFeeForOrder(orderId: string, platform: LedgerPlatform = "TIKTOK") {
  const sources = PLATFORM_SOURCES[platform];
  return prisma.$transaction(async (tx) => {
    const original = await tx.warehouseFundEntry.findUnique({
      where: { sourceType_sourceId: { sourceType: sources.debit, sourceId: orderId } },
      select: {
        id: true, warehouseId: true, currency: true, amount: true, orderId: true, details: true,
        platform: true, shopId: true, shopName: true, countryCode: true,
      },
    });
    if (!original) return { skipped: true, reason: "订单没有已记录的仓库扣费" };

    return recordWarehouseFundEntry(tx, {
      warehouseId: original.warehouseId,
      currency: original.currency,
      entryType: WarehouseFundEntryType.REVERSAL,
      amount: new Prisma.Decimal(original.amount).abs(),
      sourceType: sources.reversal,
      sourceId: orderId,
      orderId,
      platform,
      shopId: original.shopId,
      shopName: original.shopName,
      countryCode: original.countryCode,
      allowNegativeBalance: true,
      createdBy: "profit-reconciliation",
      notes: `订单 ${orderId} 取消，冲正海外仓代发扣费`,
      details: json({ platform, originalEntryId: original.id, originalDetails: original.details, reason: "ORDER_CANCELLED" }),
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

/**
 * Reconciles all shipped orders for one shop/business date from the exact
 * profit-report calculation. The report endpoint is read-only; only the
 * idempotent warehouse ledger writer below changes balances.
 */
export async function reconcileWarehouseFeesForDate(origin: string, date: string, shopId: string) {
  const params = new URLSearchParams({
    startDate: date,
    endDate: date,
    groupBy: "day",
    includeOrders: "1",
    shopId,
    autoWarehouseDebit: "0",
  });
  const response = await fetch(
    `${internalReportOrigin(origin)}/api/profit-report?${params.toString()}`,
    await internalReportRequest(),
  );
  const report = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(report?.error || `${date} 仓库扣费读取利润核算失败`);

  const orders = Array.isArray(report?.orders) ? report.orders as WarehouseFeeRow[] : [];
  const shipped = orders.filter((row) => isWarehouseShippedStatus(row.status));
  const result = await reconcileWarehouseFees(shipped);
  let reversed = 0;
  for (const row of orders.filter((item) => String(item.status).toUpperCase() === "CANCELLED")) {
    const reversal = await reverseWarehouseFeeForOrder(row.orderId);
    if (!(reversal as any).skipped) reversed += 1;
  }
  return {
    orders: orders.length,
    shipped: shipped.length,
    deducted: result.deducted,
    duplicate: result.duplicate,
    skipped: result.skipped,
    errors: result.errors,
    reversed,
  };
}

/** Reconciles one Shopee business date using the same rows shown in Shopee profit detail. */
export async function reconcileShopeeWarehouseFeesForDate(origin: string, date: string, shopId: string) {
  const orders: WarehouseFeeRow[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const params = new URLSearchParams({
      startDate: date,
      endDate: date,
      groupBy: "day",
      shopId,
      page: String(page),
      pageSize: "100",
    });
    const response = await fetch(
      `${internalReportOrigin(origin)}/api/shopee/profit?${params.toString()}`,
      await internalReportRequest(),
    );
    const report = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(report?.error || `${date} Shopee 仓库扣费读取利润核算失败`);
    const rows = Array.isArray(report?.rows) ? report.rows : [];
    orders.push(...rows.map((row: WarehouseFeeRow) => ({ ...row, platform: "SHOPEE" as const })));
    totalPages = Math.max(1, Number(report?.pagination?.totalPages) || 1);
    page += 1;
  } while (page <= totalPages && page <= 100);

  const shipped = orders.filter((row) => isShopeeWarehouseShippedStatus(row.status));
  const result = await reconcileWarehouseFees(shipped);
  let reversed = 0;
  for (const row of orders.filter((item) => String(item.status || "").toUpperCase().includes("CANCEL"))) {
    const reversal = await reverseWarehouseFeeForOrder(row.orderId, "SHOPEE");
    if (!(reversal as any).skipped) reversed += 1;
  }
  return {
    orders: orders.length,
    shipped: shipped.length,
    deducted: result.deducted,
    duplicate: result.duplicate,
    skipped: result.skipped,
    errors: result.errors,
    reversed,
  };
}

/** Reconciles the Shopee business date containing one newly pushed order. */
export async function reconcileShopeeWarehouseFeeForOrder(
  origin: string,
  orderId: string,
  shopId: string,
  createTime: Date | null | undefined,
  region: string | null | undefined,
) {
  if (!createTime || !Number.isFinite(createTime.getTime())) {
    return { skipped: true, reason: "订单时间无效", orderId, date: null, deducted: 0, duplicate: 0, reversed: 0, errors: 0 };
  }
  const date = warehouseBusinessDate(createTime, region);
  const result = await reconcileShopeeWarehouseFeesForDate(origin, date, shopId);
  return { ...result, orderId, date };
}

/**
 * Reconciles Mercado Livre orders shown by the real profit report.  Mercado
 * Livre exposes shipment state separately from the order state, so we read
 * the shipment before writing a debit.  This keeps paid-but-not-shipped
 * orders out of the overseas-warehouse ledger while still charging delivered
 * and returned parcels that were actually dispatched.
 */
export async function reconcileMercadoLivreWarehouseFeesForDate(
  origin: string,
  date: string,
  shopId?: string | null,
) {
  const params = new URLSearchParams({
    platform: "MERCADO_LIVRE",
    startDate: date,
    endDate: date,
    groupBy: "day",
    includeOrders: "1",
  });
  if (shopId) params.set("shopId", shopId);
  const response = await fetch(
    `${internalReportOrigin(origin)}/api/profit-report?${params.toString()}`,
    await internalReportRequest(),
  );
  const report = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(report?.error || `${date} Mercado Livre 仓库扣费读取利润核算失败`);

  const rows = Array.isArray(report?.orders) ? report.orders as WarehouseFeeRow[] : [];
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(shopId ? { userId: shopId } : {}) },
    select: { id: true, userId: true },
  });
  const accountByShop = new Map(accounts.map((account) => [account.userId, account]));
  const activeRows: WarehouseFeeRow[] = [];
  const cancelledRows: WarehouseFeeRow[] = [];
  for (const row of rows) {
    const orderStatus = String(row.status || "").trim().toUpperCase();
    if (orderStatus.includes("CANCEL")) {
      cancelledRows.push({ ...row, platform: "MERCADO_LIVRE" });
      continue;
    }
    const account = accountByShop.get(row.shopId || "");
    const order = account
      ? await prisma.mercadoLivreOrder.findUnique({
          where: { accountId_externalOrderId: { accountId: account.id, externalOrderId: row.orderId } },
          select: { accountId: true, shippingId: true, rawData: true, status: true },
        })
      : null;
    let shipmentStatus: string | null = null;
    const shippingId = order?.shippingId || (order?.rawData as any)?.shipping?.id?.toString() || null;
    if (order && shippingId) {
      try {
        const shipment = await withFreshMercadoLivreToken(order.accountId, (token) => getMercadoLivreShipment(token, shippingId));
        shipmentStatus = String(shipment?.status || "").trim() || null;
      } catch (error) {
        console.warn(`[Mercado Livre warehouse] 无法读取物流 ${shippingId}，跳过订单 ${row.orderId}`, error);
      }
    }
    // Some historical rows contain only a terminal order status.  It is safe
    // to accept those states as shipped; paid/confirmed rows still require a
    // positive shipment status from the API.
    if (isMercadoLivreWarehouseShippedStatus(shipmentStatus) || isMercadoLivreWarehouseShippedStatus(row.status)) {
      activeRows.push({ ...row, platform: "MERCADO_LIVRE" });
    }
  }
  const result = await reconcileWarehouseFees(activeRows);
  let reversed = 0;
  for (const row of cancelledRows) {
    const reversal = await reverseWarehouseFeeForOrder(row.orderId, "MERCADO_LIVRE");
    if (!(reversal as any).skipped) reversed += 1;
  }
  return {
    orders: rows.length,
    shipped: activeRows.length,
    deducted: result.deducted,
    duplicate: result.duplicate,
    skipped: result.skipped,
    errors: result.errors,
    reversed,
  };
}

export async function reconcileRecentMercadoLivreWarehouseFees(
  origin: string,
  input: { shopId?: string; days?: number } = {},
) {
  const days = Math.max(1, Math.min(14, Math.trunc(input.days || 7)));
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(input.shopId ? { userId: input.shopId } : {}) },
    select: { userId: true, country: true },
    orderBy: { createdAt: "asc" },
  });
  const details: Array<Record<string, unknown>> = [];
  let deducted = 0; let duplicate = 0; let reversed = 0; let skipped = 0; let errors = 0;
  for (const account of accounts) {
    const today = warehouseBusinessDate(new Date(), account.country);
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - offset);
      const businessDate = date.toISOString().slice(0, 10);
      try {
        const result = await reconcileMercadoLivreWarehouseFeesForDate(origin, businessDate, account.userId);
        deducted += result.deducted; duplicate += result.duplicate; reversed += result.reversed;
        skipped += result.skipped; errors += result.errors;
        details.push({ shopId: account.userId, date: businessDate, ...result });
      } catch (error) {
        errors += 1;
        details.push({ shopId: account.userId, date: businessDate, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { shops: accounts.length, days, deducted, duplicate, reversed, skipped, errors, details };
}

/**
 * Safety-net reconciliation for the order sync job.
 *
 * Webhook delivery is useful for low latency, but it is not a durable source
 * of truth (Shopee can return error_server and lost-push recovery can be
 * delayed).  The order sync already runs every few minutes, so reconcile a
 * short rolling window after each successful sync.  All writes are idempotent
 * by sourceType/sourceId and therefore safe to repeat.
 */
export async function reconcileRecentShopeeWarehouseFees(
  origin: string,
  input: { shopId?: string; days?: number } = {},
) {
  const days = Math.max(1, Math.min(14, Math.trunc(input.days || 7)));
  const shops = await prisma.shopeeShopSetting.findMany({
    where: {
      status: "active",
      appConfig: { status: "active" },
      ...(input.shopId ? { shopId: input.shopId } : {}),
    },
    select: { shopId: true, region: true },
    orderBy: { createdAt: "asc" },
  });
  const details: Array<Record<string, unknown>> = [];
  let deducted = 0;
  let duplicate = 0;
  let reversed = 0;
  let skipped = 0;
  let errors = 0;

  for (const shop of shops) {
    const today = warehouseBusinessDate(new Date(), shop.region);
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - offset);
      const businessDate = date.toISOString().slice(0, 10);
      try {
        const result = await reconcileShopeeWarehouseFeesForDate(origin, businessDate, shop.shopId);
        deducted += result.deducted;
        duplicate += result.duplicate;
        reversed += result.reversed;
        skipped += result.skipped;
        errors += result.errors;
        details.push({ shopId: shop.shopId, date: businessDate, ...result });
      } catch (error) {
        errors += 1;
        details.push({
          shopId: shop.shopId,
          date: businessDate,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return { shops: shops.length, days, deducted, duplicate, reversed, skipped, errors, details };
}

/** Reconciles the date containing one newly received order. */
export async function reconcileWarehouseFeeForOrder(
  origin: string,
  orderId: string,
  shopId: string,
  createTime: Date | null | undefined,
  region: string | null | undefined,
  ) {
  if (!createTime || !Number.isFinite(createTime.getTime())) {
    return {
      skipped: true,
      reason: "订单时间无效",
      orderId,
      date: null,
      deducted: 0,
      duplicate: 0,
      reversed: 0,
      errors: 0,
    };
  }
  const date = warehouseBusinessDate(createTime, region);
  const result = await reconcileWarehouseFeesForDate(origin, date, shopId);
  return { ...result, orderId, date };
}

/** Backwards-compatible sample-only reconciliation used by the sample ledger. */
export async function reconcileSampleWarehouseFeesForDate(origin: string, date: string, shopId: string) {
  const params = new URLSearchParams({ startDate: date, endDate: date, groupBy: "day", includeOrders: "1", shopId });
  const response = await fetch(
    `${internalReportOrigin(origin)}/api/profit-report?${params.toString()}`,
    await internalReportRequest(),
  );
  const report = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(report?.error || `${date} 样品仓库扣费读取失败`);
  const orders = Array.isArray(report?.orders) ? report.orders as WarehouseFeeRow[] : [];
  const samples = orders.filter((row) => row.isSampleOrder);
  const activeSamples = samples.filter((row) => isWarehouseShippedStatus(row.status));
  const result = await reconcileWarehouseFees(activeSamples);
  let reversed = 0;
  for (const row of samples.filter((item) => String(item.status).toUpperCase() === "CANCELLED")) {
    const reversal = await reverseWarehouseFeeForOrder(row.orderId);
    if (!(reversal as any).skipped) reversed += 1;
  }
  return {
    samples: samples.length,
    deducted: result.deducted,
    duplicate: result.duplicate,
    skipped: result.skipped,
    errors: result.errors,
    reversed,
  };
}
