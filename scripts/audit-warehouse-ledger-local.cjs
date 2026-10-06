const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const num = (v) => Number(v || 0);
const json = (v) => (v && typeof v === 'object' ? v : {});
const linesFrom = (raw) => {
  const value = json(raw);
  const lines = value.line_items || value.lineItems || value.items || value.product_items || [];
  return Array.isArray(lines) ? lines : [];
};
const skuOf = (line) => String(line.seller_sku || line.sellerSku || line.sku || '').trim();
const qtyOf = (line) => Math.max(1, Math.round(num(line.quantity || line.qty || line.item_quantity || 1)));

async function main() {
  const warehouses = await prisma.warehouse.findMany({ where: { type: 'OVERSEAS' }, select: { id: true, code: true, name: true } });
  // The maintenance role intentionally has no access to rule configuration;
  // the audit can still compare ledger snapshots with order master data.
  const rules = [];
  const entries = await prisma.warehouseFundEntry.findMany({
    where: { entryType: 'FULFILLMENT_DEBIT' }, orderBy: { occurredAt: 'desc' },
    select: { id: true, orderId: true, warehouseId: true, currency: true, amount: true, occurredAt: true, details: true, sourceType: true, sourceId: true, warehouse: { select: { code: true, name: true } } },
  });
  const orderIds = [...new Set(entries.map((e) => e.orderId).filter(Boolean))];
  const orders = await prisma.tikTokOrder.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, shopId: true, createTime: true, status: true, rawData: true } });
  const byOrder = new Map(orders.map((o) => [o.orderId, o]));
  const variants = await prisma.productVariant.findMany({ select: { id: true, skuId: true, weightKg: true, lengthCm: true, widthCm: true, heightCm: true } });
  const vBySku = new Map(variants.map((v) => [String(v.skuId).trim().toLowerCase(), v]));
  const mappings = await prisma.tikTokSkuMapping.findMany({ select: { tiktokShopId: true, sellerSku: true, variantId: true } });
  const vById = new Map(variants.map((v) => [v.id, v]));
  const mapping = new Map(mappings.map((m) => [`${m.tiktokShopId}\0${String(m.sellerSku).trim().toLowerCase()}`, vById.get(m.variantId)]));
  const profitMappings = await prisma.profitSkuMapping.findMany({
    where: { platform: 'TIKTOK', enabled: true },
    select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } },
  });
  const profitMapping = new Map(profitMappings.map((m) => [
    `${m.shopId}\0${String(m.sellerSku).trim().toLowerCase()}`,
    m.components.map((component) => ({ variant: vById.get(component.variantId), quantity: Math.max(1, component.quantity) })).filter((component) => component.variant),
  ]));
  const globalFee = (weight, units) => {
    const tiers = [[1, 2.5], [3, 3.5], [5, 6], [10, 8], [20, 14], [30, 20], [40, 30], [50, 33], [60, 40], [70, 47]];
    const tier = tiers.find(([max]) => weight <= max);
    if (!tier) return null;
    const outbound = tier[1] + Math.max(0, units - 1) * 0.5;
    const packaging = units > 1 ? (weight <= 3 ? 1 : weight <= 10 ? 10 : weight <= 20 ? 20 : weight <= 50 ? 25 : 0) : 0;
    return { outbound, packaging, oversize: 0, total: outbound + packaging };
  };
  const audit = entries.map((e) => {
    const order = byOrder.get(e.orderId);
    const details = json(e.details);
    const lines = order ? linesFrom(order.rawData) : [];
    const resolved = lines.flatMap((line) => {
      const sku = skuOf(line); const qty = qtyOf(line);
      const components = profitMapping.get(`${order.shopId}\0${sku.toLowerCase()}`)
        || [{ variant: mapping.get(`${order.shopId}\0${sku.toLowerCase()}`) || vBySku.get(sku.toLowerCase()), quantity: 1 }];
      return components.map((component) => {
        const variant = component.variant; const internalQty = qty * component.quantity;
        return { sellerSku: sku, sku: variant?.skuId || sku, qty: internalQty, weightKg: num(variant?.weightKg), lengthCm: num(variant?.lengthCm), widthCm: num(variant?.widthCm), heightCm: num(variant?.heightCm), variant: Boolean(variant) };
      });
    });
    const actualWeightKg = resolved.reduce((s, x) => s + x.weightKg * x.qty, 0);
    const volumeWeightKg = resolved.reduce((s, x) => s + x.lengthCm * x.widthCm * x.heightCm * x.qty, 0) / 6000;
    // Estimate the parcel's three dimensions from the largest corresponding
    // single-product dimensions. Do not pool all sides and take the top
    // three values, which can invent a second 30cm edge for F002 xN.
    const dimensions = resolved.reduce((total, row) => {
      const [length, width, height] = [row.lengthCm, row.widthCm, row.heightCm].sort((a, b) => b - a);
      return [Math.max(total[0], length), Math.max(total[1], width), Math.max(total[2], height)];
    }, [0, 0, 0]);
    const expectedChargeableKg = Math.max(actualWeightKg, volumeWeightKg);
    const expectedFee = e.warehouse.name.includes('环球盛通') && resolved.length > 0 && resolved.every((row) => row.variant && row.lengthCm > 0 && row.widthCm > 0 && row.heightCm > 0)
      ? globalFee(expectedChargeableKg, resolved.reduce((sum, row) => sum + row.qty, 0))
      : null;
    return { orderId: e.orderId, warehouse: e.warehouse, occurredAt: e.occurredAt, amount: num(e.amount), details, lines: resolved, actualWeightKg, volumeWeightKg, expectedChargeableKg, expectedDimensions: dimensions, expectedFee, delta: expectedFee ? Math.abs(num(e.amount)) - expectedFee.total : null, hasOrder: Boolean(order), status: order?.status || null };
  });
  const packaging = audit.filter((x) => num(x.details.packaging) > 0);
  const multi = packaging.filter((x) => num(x.details.billedUnits) > 1);
  const multiEntries = audit.filter((x) => num(x.details.billedUnits) > 1);
  const multiWithoutPackaging = multiEntries.filter((x) => num(x.details.packaging) <= 0);
  const suspicious = audit.filter((x) => num(x.details.chargeableWeightKg) > Math.max(3, x.expectedChargeableKg * 1.25) || Math.max(...(x.details.packageDimensions || [0])) > 60 || num(x.details.chargeableWeightKg) > 10);
  const recalculable = audit.filter((x) => x.expectedFee && Math.abs(Number(x.delta)) >= 0.01);
  const byWarehouse = new Map();
  for (const row of audit) {
    const key = row.warehouse.name;
    const current = byWarehouse.get(key) || { entries: 0, suspicious: 0, recalculable: 0, multiEntries: 0, multiWithoutPackaging: 0, packaging: 0, unresolved: 0, historicalDebit: 0, recalculatedDebit: 0, delta: 0 };
    current.entries += 1;
    current.suspicious += suspicious.includes(row) ? 1 : 0;
    current.recalculable += recalculable.includes(row) ? 1 : 0;
    current.multiEntries += num(row.details.billedUnits) > 1 ? 1 : 0;
    current.multiWithoutPackaging += num(row.details.billedUnits) > 1 && num(row.details.packaging) <= 0 ? 1 : 0;
    current.packaging += num(row.details.packaging) > 0 ? 1 : 0;
    current.unresolved += row.expectedFee ? 0 : 1;
    current.historicalDebit += Math.abs(row.amount);
    if (row.expectedFee) { current.recalculatedDebit += row.expectedFee.total; current.delta += row.delta; }
    byWarehouse.set(key, current);
  }
  const summary = {
    warehouses, rules: rules.map((r) => ({ id: r.id, warehouse: r.warehouse, pricingMode: r.pricingMode, billingUnit: r.billingUnit, currency: r.currency, effectiveFrom: r.effectiveFrom, additionalUnitFee: num(r.additionalUnitFee), multiSkuFee: num(r.multiSkuFee), useVolumetricWeight: r.useVolumetricWeight, oversizeThresholdCm: num(r.oversizeThresholdCm), oversizeFee: num(r.oversizeFee), feeTiers: r.feeTiers.map((t) => ({ min: num(t.minWeightKg), max: num(t.maxWeightKg), base: num(t.baseFee) })), packagingFeeTiers: r.packagingFeeTiers.map((t) => ({ min: num(t.minWeightKg), max: num(t.maxWeightKg), base: num(t.baseFee) })) })),
    counts: { entries: audit.length, withOrder: audit.filter((x) => x.hasOrder).length, packaging: packaging.length, packagingMulti: multi.length, multiEntries: multiEntries.length, multiWithoutPackaging: multiWithoutPackaging.length, suspicious: suspicious.length, recalculableGlobal: recalculable.length },
    totals: { historicalGlobalDebit: recalculable.reduce((sum, x) => sum + Math.abs(x.amount), 0), recalculatedGlobalDebit: recalculable.reduce((sum, x) => sum + x.expectedFee.total, 0), overcharged: recalculable.reduce((sum, x) => sum + x.delta, 0) },
    warehouseSummary: [...byWarehouse.entries()].map(([warehouse, values]) => ({ warehouse, ...values })),
    packagingSample: packaging.slice(0, 100), suspiciousSample: suspicious.slice(0, 100),
    recalculableSample: recalculable.sort((a, b) => b.delta - a.delta).slice(0, 100),
    multiWithoutPackagingSample: multiWithoutPackaging.slice(0, 100),
  };
  console.log(JSON.stringify(summary, null, 2));
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
