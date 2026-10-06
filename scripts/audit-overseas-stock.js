const { PrismaClient } = require('/srv/smart-erp/baxi/current/node_modules/@prisma/client');

const prisma = new PrismaClient();

function num(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function lineItems(raw) {
  return raw && Array.isArray(raw.line_items) ? raw.line_items : [];
}

function warehouseIdFromOrder(order, rules) {
  if (!order.createTime) return null;
  const t = new Date(order.createTime).getTime();
  const shopRules = rules
    .filter((r) => r.platform === 'TIKTOK' && r.shopId === order.shopId)
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  const matched = shopRules.find((r) => {
    const start = new Date(r.effectiveFrom).getTime();
    if (t > start) return true;
    if (t < start) return false;
    const boundary = String(r.effectiveOrderId || '').trim();
    return !boundary || String(order.orderId).localeCompare(boundary) >= 0;
  });
  return matched?.warehouseId || null;
}

async function main() {
  const warehouses = await prisma.warehouse.findMany({
    where: { type: 'OVERSEAS' },
    select: { id: true, code: true, name: true, type: true },
    orderBy: { name: 'asc' },
  });
  const warehouseIds = warehouses.map((w) => w.id);
  const [stocks, stockLogs, variants, profitMappings, directMappings, rules, orders, sampleCosts] = await Promise.all([
    prisma.stock.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { id: true, warehouseId: true, variantId: true, qty: true, availableQty: true, variant: { select: { skuId: true, product: { select: { name: true } } } } },
    }),
    prisma.stockLog.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { warehouseId: true, variantId: true, qty: true, qtyBefore: true, qtyAfter: true, movementType: true, reason: true, relatedOrderId: true, relatedOrderType: true, operationDate: true, createdAt: true },
      orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.productVariant.findMany({ select: { id: true, skuId: true } }),
    prisma.profitSkuMapping.findMany({ where: { platform: 'TIKTOK', enabled: true }, select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } } }),
    prisma.tikTokSkuMapping.findMany({ select: { tiktokShopId: true, sellerSku: true, variantId: true } }),
    prisma.profitWarehouseSwitchRule.findMany({ select: { platform: true, shopId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true } }),
    prisma.tikTokOrder.findMany({ select: { orderId: true, shopId: true, status: true, orderStatus: true, createTime: true, rawData: true } }),
    prisma.influencerSampleCost.findMany({ select: { orderId: true } }),
  ]);

  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const profitMap = new Map(profitMappings.map((m) => [`${m.shopId}\u0000${m.sellerSku.trim().toLowerCase()}`, m.components]));
  const directMap = new Map(directMappings.map((m) => [`${m.tiktokShopId}\u0000${m.sellerSku.trim().toLowerCase()}`, [{ variantId: m.variantId, quantity: 1 }]]));
  const sampleSet = new Set(sampleCosts.map((s) => s.orderId));
  const audit = new Map();
  const ensure = (warehouseId, variantId) => {
    const key = `${warehouseId}\u0000${variantId}`;
    if (!audit.has(key)) audit.set(key, { warehouseId, variantId, regularUnits: 0, sampleUnits: 0, regularOrders: 0, sampleOrders: 0, unmappedOrders: 0 });
    return audit.get(key);
  };
  const unmapped = [];
  for (const order of orders) {
    const status = String(order.status || order.orderStatus || '').toUpperCase();
    if (status === 'CANCELLED' || status === 'UNPAID') continue;
    const raw = order.rawData || {};
    const isSample = raw.is_sample_order === true || sampleSet.has(order.orderId);
    const warehouseId = warehouseIdFromOrder(order, rules);
    if (!warehouseId || !whById.has(warehouseId)) {
      unmapped.push({ orderId: order.orderId, shopId: order.shopId, status, reason: !warehouseId ? '无切仓规则' : '非海外仓' });
      continue;
    }
    let orderHadMapped = false;
    for (const item of lineItems(raw)) {
      const sellerSku = String(item?.seller_sku || item?.sellerSku || item?.sku || '').trim();
      if (!sellerSku) continue;
      const qty = Math.max(1, Math.round(num(item?.quantity) || 1));
      const components = profitMap.get(`${order.shopId}\u0000${sellerSku.toLowerCase()}`) || directMap.get(`${order.shopId}\u0000${sellerSku.toLowerCase()}`) || [];
      if (!components.length) {
        unmapped.push({ orderId: order.orderId, shopId: order.shopId, sellerSku, reason: 'SKU无内部映射' });
        continue;
      }
      orderHadMapped = true;
      for (const component of components) {
        const row = ensure(warehouseId, component.variantId);
        const units = qty * Math.max(1, num(component.quantity));
        if (isSample) { row.sampleUnits += units; row.sampleOrders += 1; }
        else { row.regularUnits += units; row.regularOrders += 1; }
      }
    }
    if (!orderHadMapped) unmapped.push({ orderId: order.orderId, shopId: order.shopId, reason: '订单无可扣减内部SKU' });
  }

  const stockByKey = new Map(stocks.map((s) => [`${s.warehouseId}\u0000${s.variantId}`, s]));
  const logsByKey = new Map();
  for (const log of stockLogs) {
    const key = `${log.warehouseId}\u0000${log.variantId}`;
    if (!logsByKey.has(key)) logsByKey.set(key, []);
    logsByKey.get(key).push(log);
  }
  const rows = [];
  for (const [key, row] of audit) {
    const stock = stockByKey.get(key);
    const logs = logsByKey.get(key) || [];
    const firstBusiness = logs.find((l) => l.movementType !== 'STOCKTAKE' && l.movementType !== 'ADJUSTMENT');
    const openingLog = [...logs].reverse().find((l) => l.movementType === 'STOCKTAKE' && l.relatedOrderType !== 'INVENTORY_LEDGER_CALIBRATION');
    const openingQty = openingLog ? num(openingLog.qtyAfter) : firstBusiness ? num(firstBusiness.qtyBefore) : num(stock?.qty);
    const start = openingLog ? logs.indexOf(openingLog) + 1 : firstBusiness ? logs.indexOf(firstBusiness) : logs.length;
    const post = logs.slice(start);
    const logOutbound = post.filter((l) => l.movementType !== 'STOCKTAKE' && l.movementType !== 'ADJUSTMENT' && num(l.qty) < 0).reduce((s, l) => s + Math.abs(num(l.qty)), 0);
    const returns = post.filter((l) => l.reason === 'RETURN_INBOUND' && num(l.qty) > 0).reduce((s, l) => s + num(l.qty), 0);
    const effectiveLogOutbound = Math.max(0, logOutbound - returns);
    rows.push({
      warehouse: whById.get(row.warehouseId)?.name || row.warehouseId,
      warehouseId: row.warehouseId,
      sku: variantById.get(row.variantId)?.skuId || row.variantId,
      variantId: row.variantId,
      openingQty,
      stockQty: num(stock?.qty),
      regularUnits: row.regularUnits,
      sampleUnits: row.sampleUnits,
      profitUnits: row.regularUnits + row.sampleUnits,
      logOutbound: effectiveLogOutbound,
      differenceProfitVsLog: row.regularUnits + row.sampleUnits - effectiveLogOutbound,
      differenceOpeningFormula: openingQty - row.regularUnits - row.sampleUnits - num(stock?.qty),
      regularOrders: row.regularOrders,
      sampleOrders: row.sampleOrders,
    });
  }
  const totals = rows.reduce((a, r) => { for (const k of ['openingQty','stockQty','regularUnits','sampleUnits','profitUnits','logOutbound','differenceProfitVsLog']) a[k] += r[k]; return a; }, { openingQty: 0, stockQty: 0, regularUnits: 0, sampleUnits: 0, profitUnits: 0, logOutbound: 0, differenceProfitVsLog: 0 });
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), warehouses, totals, rows: rows.sort((a, b) => `${a.warehouse}${a.sku}`.localeCompare(`${b.warehouse}${b.sku}`)), unmappedCount: unmapped.length, unmapped: unmapped.slice(0, 100) }, null, 2));
}

main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
