const { PrismaClient } = require('/srv/smart-erp/baxi/current/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const warehouses = await prisma.warehouse.findMany({ where: { type: 'OVERSEAS' }, select: { id: true, name: true } });
  const ids = warehouses.map((w) => w.id);
  const [logs, stocks] = await Promise.all([
    prisma.stockLog.findMany({
      where: { warehouseId: { in: ids } },
      select: { warehouseId: true, variantId: true, movementType: true, reason: true, qty: true, qtyBefore: true, qtyAfter: true, relatedOrderType: true, relatedOrderId: true, operationDate: true },
      orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.stock.findMany({ where: { warehouseId: { in: ids } }, select: { warehouseId: true, variantId: true, qty: true, variant: { select: { skuId: true } } } }),
  ]);
  const name = new Map(warehouses.map((w) => [w.id, w.name]));
  const stockByKey = new Map(stocks.map((s) => [`${s.warehouseId}\u0000${s.variantId}`, s]));
  const byKey = new Map();
  for (const log of logs) {
    const key = `${log.warehouseId}\u0000${log.variantId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(log);
  }
  const output = [...byKey].map(([key, list]) => {
    const [warehouseId] = key.split('\u0000');
    const stock = stockByKey.get(key);
    const types = {};
    for (const log of list) {
      const k = `${log.movementType}/${log.reason}/${log.relatedOrderType || '-'}`;
      types[k] = (types[k] || 0) + Number(log.qty);
    }
    return { warehouse: name.get(warehouseId), sku: stock?.variant.skuId, stockQty: stock?.qty, count: list.length, first: list[0], last: list[list.length - 1], types };
  });
  console.log(JSON.stringify(output, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
