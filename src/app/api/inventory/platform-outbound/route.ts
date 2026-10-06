import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { classifyPlatformStockLog, STOCK_PLATFORMS } from "@/lib/platform-stock-ledger";

export const dynamic = "force-dynamic";

type PlatformAccumulator = {
  salesUnits: number;
  sampleUnits: number;
  returnUnits: number;
  orderIds: Set<string>;
  cancelledOrderIds: Set<string>;
  warehouseIds: Set<string>;
  hasAggregateHistory: boolean;
};

type SkuAccumulator = {
  variantId: string;
  skuId: string;
  productName: string;
  salesUnits: number;
  sampleUnits: number;
  returnUnits: number;
  platforms: Map<string, PlatformAccumulator>;
  warehouses: Map<string, PlatformAccumulator>;
};

function emptyAccumulator(): PlatformAccumulator {
  return {
    salesUnits: 0,
    sampleUnits: 0,
    returnUnits: 0,
    orderIds: new Set(),
    cancelledOrderIds: new Set(),
    warehouseIds: new Set(),
    hasAggregateHistory: false,
  };
}

function validDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  const warehouseId = request.nextUrl.searchParams.get("warehouseId")?.trim() || null;
  const startDate = validDate(request.nextUrl.searchParams.get("startDate"));
  const endDate = validDate(request.nextUrl.searchParams.get("endDate"), true);
  const operationDate = startDate || endDate
    ? { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) }
    : undefined;

  try {
    const [logs, openings, activations, warehouses] = await Promise.all([
      prisma.stockLog.findMany({
        where: {
          ...(warehouseId ? { warehouseId } : {}),
          ...(operationDate ? { operationDate } : {}),
          warehouse: { type: "OVERSEAS" },
          OR: [
            { relatedOrderType: { in: ["PROFIT_SALES_ORDER_REBUILD", "PROFIT_SAMPLE_ORDER_REBUILD"] } },
            { relatedOrderType: { startsWith: "TIKTOK_" } },
            { relatedOrderType: { startsWith: "SHOPEE_" } },
            { relatedOrderType: { startsWith: "AMAZON_" } },
            { relatedOrderType: { startsWith: "MERCADO_LIVRE_" } },
          ],
        },
        select: {
          id: true,
          warehouseId: true,
          variantId: true,
          relatedOrderId: true,
          relatedOrderType: true,
          qty: true,
          operationDate: true,
          createdAt: true,
          variant: {
            select: {
              skuId: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      prisma.stockLog.findMany({
        where: {
          ...(warehouseId ? { warehouseId } : {}),
          warehouse: { type: "OVERSEAS" },
          movementType: "STOCKTAKE",
          OR: [
            { relatedOrderType: null },
            { relatedOrderType: { not: "INVENTORY_LEDGER_CALIBRATION" } },
          ],
        },
        select: { id: true, warehouseId: true, variantId: true, operationDate: true, createdAt: true },
        orderBy: [{ operationDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.platformStockActivation.findMany({
        orderBy: [{ platform: "asc" }, { activeFrom: "asc" }],
      }),
      prisma.warehouse.findMany({
        where: { type: "OVERSEAS", ...(warehouseId ? { id: warehouseId } : {}) },
        select: { id: true, name: true },
      }),
    ]);

    const latestOpeningByStock = new Map<string, (typeof openings)[number]>();
    for (const opening of openings) {
      latestOpeningByStock.set(`${opening.warehouseId}\u0000${opening.variantId}`, opening);
    }
    const isAfterOpening = (log: (typeof logs)[number]) => {
      const opening = latestOpeningByStock.get(`${log.warehouseId}\u0000${log.variantId}`);
      if (!opening) return true;
      const operationDelta = log.operationDate.getTime() - opening.operationDate.getTime();
      if (operationDelta !== 0) return operationDelta > 0;
      const createdDelta = log.createdAt.getTime() - opening.createdAt.getTime();
      return createdDelta > 0 || (createdDelta === 0 && log.id.localeCompare(opening.id) > 0);
    };
    const totals = new Map<string, PlatformAccumulator>();
    const byWarehouse = new Map<string, PlatformAccumulator>();
    const bySku = new Map<string, SkuAccumulator>();
    for (const log of logs) {
      if (!isAfterOpening(log)) continue;
      const classification = classifyPlatformStockLog(log.relatedOrderType);
      if (!classification) continue;
      const platformTotal = totals.get(classification.platform) || emptyAccumulator();
      const warehouseKey = `${classification.platform}\u0000${log.warehouseId}`;
      const warehouseTotal = byWarehouse.get(warehouseKey) || emptyAccumulator();
      const skuTotal = bySku.get(log.variantId) || {
        variantId: log.variantId,
        skuId: log.variant.skuId,
        productName: log.variant.product.name,
        salesUnits: 0,
        sampleUnits: 0,
        returnUnits: 0,
        platforms: new Map<string, PlatformAccumulator>(),
        warehouses: new Map<string, PlatformAccumulator>(),
      };
      const skuPlatformTotal = skuTotal.platforms.get(classification.platform) || emptyAccumulator();
      const skuWarehouseTotal = skuTotal.warehouses.get(log.warehouseId) || emptyAccumulator();
      for (const target of [platformTotal, warehouseTotal, skuPlatformTotal, skuWarehouseTotal]) {
        target.warehouseIds.add(log.warehouseId);
        target.hasAggregateHistory ||= classification.aggregateHistory;
        if (classification.kind === "sales") {
          target.salesUnits += Math.abs(Math.min(0, log.qty));
          if (log.relatedOrderId) target.orderIds.add(log.relatedOrderId);
        } else if (classification.kind === "sample") {
          target.sampleUnits += Math.abs(Math.min(0, log.qty));
        } else {
          target.returnUnits += Math.max(0, log.qty);
          if (log.relatedOrderId) target.cancelledOrderIds.add(log.relatedOrderId);
        }
      }
      if (classification.kind === "sales") skuTotal.salesUnits += Math.abs(Math.min(0, log.qty));
      else if (classification.kind === "sample") skuTotal.sampleUnits += Math.abs(Math.min(0, log.qty));
      else skuTotal.returnUnits += Math.max(0, log.qty);
      totals.set(classification.platform, platformTotal);
      byWarehouse.set(warehouseKey, warehouseTotal);
      skuTotal.platforms.set(classification.platform, skuPlatformTotal);
      skuTotal.warehouses.set(log.warehouseId, skuWarehouseTotal);
      bySku.set(log.variantId, skuTotal);
    }

    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
    const activationByPlatform = new Map<string, typeof activations>();
    for (const activation of activations) {
      const rows = activationByPlatform.get(activation.platform) || [];
      rows.push(activation);
      activationByPlatform.set(activation.platform, rows);
    }
    const serialize = (value: PlatformAccumulator) => ({
      salesUnits: Math.max(0, value.salesUnits - value.returnUnits),
      sampleUnits: value.sampleUnits,
      returnUnits: value.returnUnits,
      totalUnits: Math.max(0, value.salesUnits - value.returnUnits) + value.sampleUnits,
      orderCount: [...value.orderIds].filter((orderId) => !value.cancelledOrderIds.has(orderId)).length,
      warehouseCount: value.warehouseIds.size,
      hasAggregateHistory: value.hasAggregateHistory,
    });
    const platforms = STOCK_PLATFORMS.map(({ platform, label }) => {
      const value = totals.get(platform) || emptyAccumulator();
      const platformActivations = activationByPlatform.get(platform) || [];
      return {
        platform,
        label,
        ...serialize(value),
        enabled: platform === "TIKTOK" || platformActivations.some((activation) => activation.enabled),
        activeFrom: platformActivations.find((activation) => activation.enabled)?.activeFrom.toISOString() || null,
        shopsEnabled: platform === "TIKTOK" ? null : platformActivations.filter((activation) => activation.enabled).length,
        warehouses: warehouses.map((warehouse) => ({
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          ...serialize(byWarehouse.get(`${platform}\u0000${warehouse.id}`) || emptyAccumulator()),
        })).filter((row) => row.totalUnits > 0),
      };
    });
    const summary = platforms.reduce((total, platform) => ({
      salesUnits: total.salesUnits + platform.salesUnits,
      sampleUnits: total.sampleUnits + platform.sampleUnits,
      returnUnits: total.returnUnits + platform.returnUnits,
      totalUnits: total.totalUnits + platform.totalUnits,
    }), { salesUnits: 0, sampleUnits: 0, returnUnits: 0, totalUnits: 0 });
    const skus = [...bySku.values()].map((sku) => ({
      variantId: sku.variantId,
      skuId: sku.skuId,
      productName: sku.productName,
      salesUnits: Math.max(0, sku.salesUnits - sku.returnUnits),
      sampleUnits: sku.sampleUnits,
      returnUnits: sku.returnUnits,
      totalUnits: Math.max(0, sku.salesUnits - sku.returnUnits) + sku.sampleUnits,
      platforms: STOCK_PLATFORMS.map(({ platform, label }) => ({
        platform,
        label,
        ...serialize(sku.platforms.get(platform) || emptyAccumulator()),
      })).filter((row) => row.totalUnits > 0 || row.returnUnits > 0),
      warehouses: warehouses.map((warehouse) => ({
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        ...serialize(sku.warehouses.get(warehouse.id) || emptyAccumulator()),
      })).filter((row) => row.totalUnits > 0 || row.returnUnits > 0),
    })).sort((a, b) => b.totalUnits - a.totalUnits || a.skuId.localeCompare(b.skuId));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      warehouseId,
      warehouseName: warehouseId ? warehouseById.get(warehouseId) || warehouseId : null,
      summary,
      platforms,
      skus,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Platform Stock Outbound]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "多平台出库统计失败" }, { status: 500 });
  }
}
