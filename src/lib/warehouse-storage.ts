import { prisma } from "@/lib/prisma";

const DAY_MS = 86400000;

export type WarehouseStorageChargeRow = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  currency: string;
  ruleId: string;
  freeDays: number;
  dailyRate: number;
  date: string;
  batchId: string;
  batchNumber: string;
  receivedDate: string;
  variantId: string;
  sku: string;
  qty: number;
  unitVolumeCbm: number;
  volumeCbm: number;
  ageDays: number;
  chargeableDays: number;
  amount: number;
  status: "CHARGEABLE" | "FREE" | "MISSING_DIMENSIONS" | "UNTRACKED";
};

export type WarehouseStorageReport = {
  date: string;
  total: number;
  rows: WarehouseStorageChargeRow[];
  missingDimensions: Array<{ warehouseName: string; sku: string; variantId: string; qty: number }>;
  untracked: Array<{ warehouseName: string; sku: string; variantId: string; qty: number }>;
};

function dateOnly(value: Date | string) {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : value;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.floor((dateOnly(to).getTime() - dateOnly(from).getTime()) / DAY_MS));
}

function variantForBatch(batch: any, variantId: string) {
  if (batch.pendingInbound?.variantId === variantId) return true;
  return Boolean(batch.pendingInbound?.items?.some((item: any) => item.variantId === variantId && (item.sku === batch.pendingInbound?.sku || !batch.pendingInbound?.sku)));
}

/**
 * Calculates the storage charge for one calendar day. Stock lots are matched
 * to the newest inbound batches first because the database currently stores
 * stock quantity by SKU, while the inbound batches carry the receipt date.
 * The result is deliberately a preview; posting it is a separate idempotent
 * operation in the API.
 */
export async function calculateWarehouseStorageForDate(asOf: Date | string = new Date(), warehouseId?: string): Promise<WarehouseStorageReport> {
  const target = dateOnly(asOf);
  const targetText = dateText(target);
  const warehouses = await prisma.warehouse.findMany({
    where: { type: "OVERSEAS", isActive: true, ...(warehouseId ? { id: warehouseId } : {}) },
    select: {
      id: true, code: true, name: true,
      storageRules: {
        where: { enabled: true, effectiveFrom: { lte: target }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: target } }] },
        orderBy: { effectiveFrom: "desc" }, take: 1,
      },
      stocks: {
        where: { qty: { gt: 0 } },
        select: { variantId: true, qty: true, variant: { select: { skuId: true, lengthCm: true, widthCm: true, heightCm: true } } },
      },
      inboundBatches: {
        select: {
          id: true, batchNumber: true, qty: true, receivedDate: true,
          pendingInbound: { select: { variantId: true, sku: true, items: { select: { variantId: true, sku: true } } } },
        },
        orderBy: { receivedDate: "desc" },
      },
    },
  });

  const rows: WarehouseStorageChargeRow[] = [];
  const missingDimensions: WarehouseStorageReport["missingDimensions"] = [];
  const untracked: WarehouseStorageReport["untracked"] = [];

  for (const warehouse of warehouses) {
    const rule = warehouse.storageRules[0];
    if (!rule || Number(rule.dailyRate) <= 0) continue;
    for (const stock of warehouse.stocks) {
      let remaining = stock.qty;
      const batches = warehouse.inboundBatches.filter((batch) => variantForBatch(batch, stock.variantId));
      for (const batch of batches) {
        if (remaining <= 0) break;
        const qty = Math.min(remaining, batch.qty);
        remaining -= qty;
        const unitVolumeCbm = Number(stock.variant.lengthCm || 0) * Number(stock.variant.widthCm || 0) * Number(stock.variant.heightCm || 0) / 1_000_000;
        const ageDays = daysBetween(batch.receivedDate, target);
        const chargeableDays = Math.max(0, ageDays - rule.freeDays);
        const hasDimensions = unitVolumeCbm > 0;
        const status = !hasDimensions ? "MISSING_DIMENSIONS" : chargeableDays > 0 ? "CHARGEABLE" : "FREE";
        const amount = status === "CHARGEABLE" ? Number((qty * unitVolumeCbm * Number(rule.dailyRate)).toFixed(2)) : 0;
        rows.push({ warehouseId: warehouse.id, warehouseName: warehouse.name, warehouseCode: warehouse.code, currency: rule.currency, ruleId: rule.id, freeDays: rule.freeDays, dailyRate: Number(rule.dailyRate), date: targetText, batchId: batch.id, batchNumber: batch.batchNumber, receivedDate: batch.receivedDate.toISOString(), variantId: stock.variantId, sku: stock.variant.skuId, qty, unitVolumeCbm, volumeCbm: Number((qty * unitVolumeCbm).toFixed(6)), ageDays, chargeableDays, amount, status });
        if (!hasDimensions) missingDimensions.push({ warehouseName: warehouse.name, sku: stock.variant.skuId, variantId: stock.variantId, qty });
      }
      if (remaining > 0) untracked.push({ warehouseName: warehouse.name, sku: stock.variant.skuId, variantId: stock.variantId, qty: remaining });
    }
  }

  return { date: targetText, total: Number(rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)), rows, missingDimensions, untracked };
}
