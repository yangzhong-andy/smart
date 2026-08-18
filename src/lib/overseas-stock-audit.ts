import type { PrismaClient } from "@prisma/client";

type AuditRow = {
  warehouseId: string;
  variantId: string;
  salesUnits: number;
  sampleUnits: number;
};

const EXCLUDED_ORDER_STATUSES = new Set(["CANCELLED", "UNPAID"]);

function positiveInteger(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed || 1)) : 1;
}

function orderWarehouseId(
  order: { shopId: string; orderId: string; createTime: Date | null },
  rules: Array<{ platform: string; shopId: string; warehouseId: string; effectiveFrom: Date; effectiveOrderId: string | null }>,
) {
  if (!order.createTime) return null;
  const orderTime = order.createTime.getTime();
  const candidates = rules
    .filter((rule) => rule.platform === "TIKTOK" && rule.shopId === order.shopId)
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime());
  const rule = candidates.find((candidate) => {
    const effectiveTime = candidate.effectiveFrom.getTime();
    if (orderTime > effectiveTime) return true;
    if (orderTime < effectiveTime) return false;
    return !candidate.effectiveOrderId || order.orderId.localeCompare(candidate.effectiveOrderId) >= 0;
  });
  return rule?.warehouseId || null;
}

/**
 * Read-only overseas stock audit. The operational balance remains untouched;
 * this compares it against the same warehouse-switch and bundle BOM rules
 * used by profit calculation.
 */
export async function buildOverseasStockAudit(prisma: PrismaClient) {
  const warehouses = await prisma.warehouse.findMany({
    where: { type: "OVERSEAS" },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const [stocks, deductions, rebuildBaselines, profitMappings, legacyMappings, rules, orders, manualSampleCosts] = await Promise.all([
    prisma.stock.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: {
        warehouseId: true,
        variantId: true,
        qty: true,
        variant: { select: { skuId: true, product: { select: { name: true } } } },
      },
    }),
    prisma.tikTokStockDeduction.groupBy({
      by: ["warehouseId", "variantId"],
      where: { warehouseId: { in: warehouseIds }, status: "deducted" },
      _sum: { qty: true },
    }),
    prisma.stockLog.findMany({
      where: {
        warehouseId: { in: warehouseIds },
        relatedOrderType: "PROFIT_ORDER_STOCK_BASELINE",
      },
      select: { warehouseId: true, variantId: true, qtyAfter: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.profitSkuMapping.findMany({
      where: { platform: "TIKTOK", enabled: true },
      select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } },
    }),
    prisma.tikTokSkuMapping.findMany({
      select: { tiktokShopId: true, sellerSku: true, variantId: true },
    }),
    prisma.profitWarehouseSwitchRule.findMany({
      select: { platform: true, shopId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
    }),
    prisma.tikTokOrder.findMany({
      select: { orderId: true, shopId: true, status: true, orderStatus: true, createTime: true, rawData: true },
    }),
    prisma.influencerSampleCost.findMany({ select: { orderId: true } }),
  ]);

  const overseasWarehouseIds = new Set(warehouseIds);
  const sampleCostOrderIds = new Set(manualSampleCosts.map((row) => row.orderId));
  const componentByShopSku = new Map(
    profitMappings.map((mapping) => [
      `${mapping.shopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`,
      mapping.components.map((component) => ({ variantId: component.variantId, quantity: Number(component.quantity) })),
    ]),
  );
  const legacyComponentByShopSku = new Map(
    legacyMappings.map((mapping) => [
      `${mapping.tiktokShopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`,
      [{ variantId: mapping.variantId, quantity: 1 }],
    ]),
  );
  const auditRows = new Map<string, AuditRow>();
  const sampleOrderIdsByWarehouse = new Map<string, Set<string>>();
  const salesOrderIdsByWarehouse = new Map<string, Set<string>>();
  let missingWarehouseOrders = 0;
  let missingSkuOrders = 0;

  const addUnits = (warehouseId: string, variantId: string, units: number, isSample: boolean) => {
    const key = `${warehouseId}\u0000${variantId}`;
    const row = auditRows.get(key) || { warehouseId, variantId, salesUnits: 0, sampleUnits: 0 };
    if (isSample) row.sampleUnits += units;
    else row.salesUnits += units;
    auditRows.set(key, row);
  };

  for (const order of orders) {
    const status = String(order.status || order.orderStatus || "").toUpperCase();
    if (EXCLUDED_ORDER_STATUSES.has(status)) continue;
    const raw = (order.rawData || {}) as Record<string, any>;
    const isSample = raw.is_sample_order === true || sampleCostOrderIds.has(order.orderId);
    const warehouseId = orderWarehouseId(order, rules);
    if (!warehouseId || !overseasWarehouseIds.has(warehouseId)) {
      missingWarehouseOrders += 1;
      continue;
    }
    const lineItems = Array.isArray(raw.line_items) ? raw.line_items : [];
    let mappedAnyLine = false;
    for (const item of lineItems) {
      const sellerSku = String(item?.seller_sku || item?.sellerSku || item?.sku || "").trim();
      if (!sellerSku) continue;
      const mapKey = `${order.shopId}\u0000${sellerSku.toLowerCase()}`;
      const components = componentByShopSku.get(mapKey) || legacyComponentByShopSku.get(mapKey) || [];
      if (components.length === 0) continue;
      mappedAnyLine = true;
      const sellerUnits = positiveInteger(item?.quantity);
      for (const component of components) {
        addUnits(warehouseId, component.variantId, sellerUnits * positiveInteger(component.quantity), isSample);
      }
    }
    if (!mappedAnyLine) {
      missingSkuOrders += 1;
      continue;
    }
    const target = isSample ? sampleOrderIdsByWarehouse : salesOrderIdsByWarehouse;
    const ids = target.get(warehouseId) || new Set<string>();
    ids.add(order.orderId);
    target.set(warehouseId, ids);
  }

  const stockByKey = new Map(stocks.map((stock) => [`${stock.warehouseId}\u0000${stock.variantId}`, stock]));
  const legacyByKey = new Map(deductions.map((row) => [`${row.warehouseId}\u0000${row.variantId}`, Number(row._sum.qty || 0)]));
  const rebuildBaselineByKey = new Map<string, number>();
  for (const baseline of rebuildBaselines) {
    const key = `${baseline.warehouseId}\u0000${baseline.variantId}`;
    if (!rebuildBaselineByKey.has(key)) rebuildBaselineByKey.set(key, Number(baseline.qtyAfter));
  }
  const allKeys = new Set([...stockByKey.keys(), ...auditRows.keys()]);
  const warehouseRows = new Map<string, any[]>();
  for (const key of allKeys) {
    const audit = auditRows.get(key);
    const stock = stockByKey.get(key);
    const [warehouseId, variantId] = key.split("\u0000");
    const currentQty = Number(stock?.qty || 0);
    const legacyOutboundUnits = legacyByKey.get(key) || 0;
    const salesUnits = audit?.salesUnits || 0;
    const sampleUnits = audit?.sampleUnits || 0;
    const trueOutboundUnits = salesUnits + sampleUnits;
    // Once the real-order rebuild has been approved, preserve its opening
    // baseline. Before that one-time event, derive the legacy opening from
    // the current balance plus the former TikTok deduction total.
    const openingQty = rebuildBaselineByKey.get(key) ?? currentQty + legacyOutboundUnits;
    const expectedQty = openingQty - trueOutboundUnits;
    const row = {
      warehouseId,
      variantId,
      skuId: stock?.variant.skuId || variantId,
      productName: stock?.variant.product.name || "库存 SKU 已缺失",
      currentQty,
      openingQty,
      salesUnits,
      sampleUnits,
      trueOutboundUnits,
      legacyOutboundUnits,
      expectedQty,
      differenceQty: currentQty - expectedQty,
      hasStockRecord: Boolean(stock),
    };
    const rows = warehouseRows.get(warehouseId) || [];
    rows.push(row);
    warehouseRows.set(warehouseId, rows);
  }

  const warehouseSummaries = warehouses.map((warehouse) => {
    const rows = (warehouseRows.get(warehouse.id) || []).sort((left, right) => left.skuId.localeCompare(right.skuId));
    const totals = rows.reduce((sum, row) => ({
      openingQty: sum.openingQty + row.openingQty,
      currentQty: sum.currentQty + row.currentQty,
      salesUnits: sum.salesUnits + row.salesUnits,
      sampleUnits: sum.sampleUnits + row.sampleUnits,
      trueOutboundUnits: sum.trueOutboundUnits + row.trueOutboundUnits,
      legacyOutboundUnits: sum.legacyOutboundUnits + row.legacyOutboundUnits,
      expectedQty: sum.expectedQty + row.expectedQty,
      differenceQty: sum.differenceQty + row.differenceQty,
    }), { openingQty: 0, currentQty: 0, salesUnits: 0, sampleUnits: 0, trueOutboundUnits: 0, legacyOutboundUnits: 0, expectedQty: 0, differenceQty: 0 });
    return {
      ...warehouse,
      ...totals,
      salesOrderCount: salesOrderIdsByWarehouse.get(warehouse.id)?.size || 0,
      sampleOrderCount: sampleOrderIdsByWarehouse.get(warehouse.id)?.size || 0,
      rows,
    };
  });
  const summary = warehouseSummaries.reduce((sum, warehouse) => ({
    openingQty: sum.openingQty + warehouse.openingQty,
    currentQty: sum.currentQty + warehouse.currentQty,
    salesUnits: sum.salesUnits + warehouse.salesUnits,
    sampleUnits: sum.sampleUnits + warehouse.sampleUnits,
    trueOutboundUnits: sum.trueOutboundUnits + warehouse.trueOutboundUnits,
    legacyOutboundUnits: sum.legacyOutboundUnits + warehouse.legacyOutboundUnits,
    expectedQty: sum.expectedQty + warehouse.expectedQty,
    differenceQty: sum.differenceQty + warehouse.differenceQty,
  }), { openingQty: 0, currentQty: 0, salesUnits: 0, sampleUnits: 0, trueOutboundUnits: 0, legacyOutboundUnits: 0, expectedQty: 0, differenceQty: 0 });

  return {
    generatedAt: new Date().toISOString(),
    summary,
    warehouses: warehouseSummaries,
    coverage: { missingWarehouseOrders, missingSkuOrders },
  };
}
