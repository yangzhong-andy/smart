/** One-off, audited correction for the BRILHO NOVO BR Shopee switch on 2026-10-02.
 * Run on the baxi host with its production environment: bind, preview, apply.
 * Never run this against sdfy/3003. A database backup is required before bind.
 */
import { InventoryMovementType, Prisma, StockLogReason, WarehouseFundEntryType } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "../src/lib/prisma";
import { clearCacheByPrefix } from "../src/lib/redis";
import { recordWarehouseFundEntry } from "../src/lib/warehouse-funds";

const SHOP_ID = "1842551792";
const ORDER_ID = "261002JJ1SQWMJ";
const OLD_WAREHOUSE = "afab0afc-f8c4-41a6-bef5-cb7d70460bfc";
const NEW_WAREHOUSE = "8d9a0e46-5b84-4379-bfa7-20149318107e";
const ORIGINAL_SOURCE = "SHOPEE_PROFIT_ORDER_FULFILLMENT";
const OLD_CREDIT_SOURCE = `${ORIGINAL_SOURCE}_WAREHOUSE_SWITCH_OLD_CREDIT`;
const NEW_DEBIT_SOURCE = `${ORIGINAL_SOURCE}_WAREHOUSE_SWITCH_NEW_DEBIT`;
const REPAIR_KEY = "SHOPEE_BRILHO_SWITCH_20261002";

type ProfitRow = {
  orderId: string;
  warehouseId: string | null;
  warehouseName?: string;
  status?: string;
  warehouseFeeBreakdown?: { total: number; currency?: string; [key: string]: unknown };
};

function money(value: unknown) {
  return new Prisma.Decimal(value == null ? 0 : String(value)).toDecimalPlaces(2);
}

function brazilToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function daysFrom(start: string, end: string) {
  const days: string[] = [];
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`); time += 86400000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

async function boundaryOrder() {
  const order = await prisma.shopeeOrder.findUnique({
    where: { shopId_orderSn: { shopId: SHOP_ID, orderSn: ORDER_ID } },
    select: { orderSn: true, shopId: true, createTime: true },
  });
  const createTime = order?.createTime;
  if (!order || !createTime || createTime.toISOString() !== "2026-10-02T10:57:43.000Z") {
    throw new Error(`Boundary order is missing or changed: ${JSON.stringify(order)}`);
  }
  return { ...order, createTime };
}

async function bind() {
  const order = await boundaryOrder();
  const [shop, warehouse, rules] = await Promise.all([
    prisma.shopeeShopSetting.findFirst({ where: { shopId: SHOP_ID }, select: { region: true } }),
    prisma.warehouse.findUnique({ where: { id: NEW_WAREHOUSE }, select: { type: true, name: true } }),
    prisma.profitWarehouseSwitchRule.findMany({ where: { platform: "SHOPEE", shopId: SHOP_ID }, orderBy: { effectiveFrom: "asc" } }),
  ]);
  if (shop?.region !== "BR" || warehouse?.type !== "OVERSEAS") throw new Error("Shop or target warehouse changed");
  if (rules.length !== 1 || rules[0].warehouseId !== OLD_WAREHOUSE || rules[0].effectiveFrom >= order.createTime) {
    throw new Error(`Unexpected existing switch history: ${JSON.stringify(rules)}`);
  }
  const rule = await prisma.profitWarehouseSwitchRule.create({
    data: {
      platform: "SHOPEE", region: "BR", shopId: SHOP_ID, externalWarehouseId: "*",
      warehouseId: NEW_WAREHOUSE, effectiveFrom: order.createTime, effectiveOrderId: ORDER_ID,
      notes: `${REPAIR_KEY}: user-confirmed first new-warehouse order; historical stock/fee correction follows`,
    },
  });
  await clearCacheByPrefix("profit-report");
  console.log(JSON.stringify({ phase: "bind", ruleId: rule.id, orderId: ORDER_ID, effectiveFrom: order.createTime, warehouse: warehouse.name }));
}

async function profitRows() {
  const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No active user for internal read-only report request");
  const authSecret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!authSecret) throw new Error("NEXTAUTH_SECRET or JWT_SECRET is required for the internal report request");
  const rows = new Map<string, ProfitRow>();
  const lastDay = brazilToday();
  for (const day of daysFrom("2026-10-02", lastDay)) {
    let page = 1;
    let totalPages = 1;
    do {
      const token = jwt.sign({ userId: user.id }, authSecret, { algorithm: "HS256", expiresIn: 120 });
      const params = new URLSearchParams({ startDate: day, endDate: day, groupBy: "day", shopId: SHOP_ID, page: String(page), pageSize: "100" });
      const response = await fetch(`http://127.0.0.1:3001/api/shopee/profit?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const report = await response.json().catch(() => null);
      if (!response.ok || !report || !Array.isArray(report.rows)) {
        throw new Error(`Shopee profit report ${day} page ${page} failed: HTTP ${response.status} ${JSON.stringify(report?.error || null)}`);
      }
      for (const row of report.rows as ProfitRow[]) {
        if (rows.has(row.orderId)) throw new Error(`Duplicate report order ${row.orderId}`);
        rows.set(row.orderId, row);
      }
      totalPages = Math.max(1, Number(report.pagination?.totalPages) || 1);
      page += 1;
    } while (page <= totalPages && page <= 100);
    if (totalPages > 100) throw new Error(`Report pagination exceeded 100 pages on ${day}`);
    console.log(JSON.stringify({ day, pages: totalPages, totalRowsSoFar: rows.size }));
  }
  return rows;
}

async function plan() {
  const order = await boundaryOrder();
  const rule = await prisma.profitWarehouseSwitchRule.findFirst({
    where: { platform: "SHOPEE", shopId: SHOP_ID, warehouseId: NEW_WAREHOUSE, effectiveFrom: order.createTime, effectiveOrderId: ORDER_ID },
  });
  if (!rule) throw new Error("The new warehouse switch rule is not bound yet");
  const [report, oldDebits, oldStock] = await Promise.all([
    profitRows(),
    prisma.warehouseFundEntry.findMany({
      where: {
        sourceType: ORIGINAL_SOURCE, platform: "SHOPEE", shopId: SHOP_ID, warehouseId: OLD_WAREHOUSE,
        occurredAt: { gte: order.createTime },
      },
      orderBy: { sourceId: "asc" },
    }),
    prisma.platformStockDeduction.findMany({
      where: { platform: "SHOPEE", shopId: SHOP_ID, warehouseId: OLD_WAREHOUSE, status: "deducted", orderCreateTime: { gte: order.createTime } },
      select: { id: true, orderId: true, variantId: true, qty: true },
    }),
  ]);
  const reversalIds = new Set((await prisma.warehouseFundEntry.findMany({
    where: { sourceType: "SHOPEE_PROFIT_ORDER_FULFILLMENT_REVERSAL", sourceId: { in: oldDebits.map((row) => row.sourceId) } },
    select: { sourceId: true },
  })).map((row) => row.sourceId));
  const priorNewDebits = new Set((await prisma.warehouseFundEntry.findMany({
    where: { sourceType: NEW_DEBIT_SOURCE, sourceId: { in: oldDebits.map((row) => row.sourceId) } },
    select: { sourceId: true },
  })).map((row) => row.sourceId));
  const fees = oldDebits.filter((debit) => !reversalIds.has(debit.sourceId) && !priorNewDebits.has(debit.sourceId)).map((debit) => {
    const row = report.get(debit.sourceId);
    if (!row || row.warehouseId !== NEW_WAREHOUSE || !row.warehouseFeeBreakdown || money(row.warehouseFeeBreakdown.total).lte(0)) {
      throw new Error(`New-warehouse report fee missing for ${debit.sourceId}: ${JSON.stringify(row)}`);
    }
    if (String(row.status || "").toUpperCase().includes("CANCEL")) throw new Error(`Canceled order without reversal: ${debit.sourceId}`);
    if (String(row.warehouseFeeBreakdown.currency || "BRL").toUpperCase() !== debit.currency) {
      throw new Error(`Currency mismatch for ${debit.sourceId}`);
    }
    return { debit, row, newAmount: money(row.warehouseFeeBreakdown.total) };
  });
  const totalOld = fees.reduce((sum, fee) => sum.add(money(fee.debit.amount).abs()), money(0));
  const totalNew = fees.reduce((sum, fee) => sum.add(fee.newAmount), money(0));
  const stockQty = oldStock.reduce((sum, deduction) => sum + deduction.qty, 0);
  console.log(JSON.stringify({ phase: "plan", boundary: order.createTime, uncorrectedStockRows: oldStock.length, uncorrectedStockQty: stockQty, uncorrectedFeeRows: fees.length, oldFeeTotal: totalOld.toFixed(2), newFeeTotal: totalNew.toFixed(2), newFeeDifference: totalNew.sub(totalOld).toFixed(2) }));
  return { fees, oldStock };
}

async function apply() {
  const { fees, oldStock } = await plan();
  if (fees.length === 0 && oldStock.length === 0) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REPAIR_KEY}))`;
    const variantQty = new Map<string, number>();
    for (const deduction of oldStock) variantQty.set(deduction.variantId, (variantQty.get(deduction.variantId) || 0) + deduction.qty);
    for (const [variantId, qty] of variantQty) {
      for (const warehouseId of [OLD_WAREHOUSE, NEW_WAREHOUSE].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${warehouseId}:${variantId}`}))`;
      }
      const [oldStockRow, newStockRow, variant] = await Promise.all([
        tx.stock.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId: OLD_WAREHOUSE } } }),
        tx.stock.findUniqueOrThrow({ where: { variantId_warehouseId: { variantId, warehouseId: NEW_WAREHOUSE } } }),
        tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { costPrice: true, currency: true } }),
      ]);
      if (newStockRow.availableQty < qty || newStockRow.qty < qty) throw new Error(`New warehouse stock insufficient for ${variantId}: ${qty}`);
      const claimed = await tx.platformStockDeduction.updateMany({
        where: { id: { in: oldStock.filter((row) => row.variantId === variantId).map((row) => row.id) }, warehouseId: OLD_WAREHOUSE, status: "deducted" },
        data: { warehouseId: NEW_WAREHOUSE },
      });
      if (claimed.count !== oldStock.filter((row) => row.variantId === variantId).length) throw new Error(`Stock deductions changed for ${variantId}`);
      const oldAfter = await tx.stock.update({ where: { id: oldStockRow.id }, data: { qty: { increment: qty }, availableQty: { increment: qty } } });
      const newAfter = await tx.stock.update({ where: { id: newStockRow.id }, data: { qty: { decrement: qty }, availableQty: { decrement: qty } } });
      for (const movement of [
        { warehouseId: OLD_WAREHOUSE, change: qty, before: oldStockRow.qty, after: oldAfter.qty },
        { warehouseId: NEW_WAREHOUSE, change: -qty, before: newStockRow.qty, after: newAfter.qty },
      ]) {
        await tx.stockLog.create({
          data: {
            variantId, warehouseId: movement.warehouseId,
            movementType: InventoryMovementType.ADJUSTMENT, reason: StockLogReason.STOCKTAKE_ADJUSTMENT,
            qty: movement.change, qtyBefore: movement.before, qtyAfter: movement.after,
            unitCost: variant.costPrice, totalCost: money(variant.costPrice).mul(movement.change), currency: variant.currency || "CNY",
            operator: REPAIR_KEY, operationDate: new Date(), relatedOrderType: REPAIR_KEY, relatedOrderNumber: ORDER_ID,
            notes: "Shopee 10/02 切仓后的历史订单扣库存归属修正；非实物移库，旧仓回补、新仓扣减",
          },
        });
      }
    }
    for (const { debit, row, newAmount } of fees) {
      const original = await tx.warehouseFundEntry.findUniqueOrThrow({ where: { id: debit.id } });
      if (original.warehouseId !== OLD_WAREHOUSE || !money(original.amount).equals(money(debit.amount))) {
        throw new Error(`Original fee changed for ${debit.sourceId}`);
      }
      const canceled = await tx.warehouseFundEntry.findUnique({
        where: { sourceType_sourceId: { sourceType: "SHOPEE_PROFIT_ORDER_FULFILLMENT_REVERSAL", sourceId: debit.sourceId } },
      });
      if (canceled) throw new Error(`Order canceled during correction: ${debit.sourceId}`);
      const common = {
        currency: debit.currency, sourceId: debit.sourceId, orderId: debit.orderId,
        platform: "SHOPEE", shopId: SHOP_ID, shopName: debit.shopName, countryCode: debit.countryCode,
        occurredAt: debit.occurredAt, allowNegativeBalance: true, createdBy: REPAIR_KEY,
      };
      const credit = await recordWarehouseFundEntry(tx, {
        ...common, warehouseId: OLD_WAREHOUSE, entryType: WarehouseFundEntryType.REVERSAL,
        amount: money(debit.amount).abs(), sourceType: OLD_CREDIT_SOURCE,
        notes: `10/02 店铺切仓费用归属修正，原流水 ${debit.id} 从旧仓冲回`,
        details: { reason: REPAIR_KEY, originalEntryId: debit.id, boundaryOrderId: ORDER_ID },
      });
      const charge = await recordWarehouseFundEntry(tx, {
        ...common, warehouseId: NEW_WAREHOUSE, entryType: WarehouseFundEntryType.FULFILLMENT_DEBIT,
        amount: newAmount.neg(), sourceType: NEW_DEBIT_SOURCE,
        notes: `10/02 店铺切仓费用归属修正，按新仓规则重算；原流水 ${debit.id}`,
        details: { reason: REPAIR_KEY, originalEntryId: debit.id, boundaryOrderId: ORDER_ID, newFeeBreakdown: row.warehouseFeeBreakdown as Prisma.InputJsonValue },
      });
      if (credit.duplicated || charge.duplicated) throw new Error(`Correction was concurrently posted for ${debit.sourceId}`);
    }
  }, { timeout: 300000, maxWait: 10000 });
  await clearCacheByPrefix("profit-report");
  console.log(JSON.stringify({ phase: "apply", migratedStockRows: oldStock.length, migratedFeeRows: fees.length }));
}

async function main() {
  const mode = process.argv[2];
  if (mode === "bind") return bind();
  if (mode === "preview") return void await plan();
  if (mode === "apply") return apply();
  throw new Error("Usage: tsx scripts/repair-brilho-shopee-switch-20261002.ts <bind|preview|apply>");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
