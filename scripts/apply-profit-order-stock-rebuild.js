const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient, Prisma } = require("/srv/smart-erp/baxi/current/node_modules/@prisma/client");

const prisma = new PrismaClient();
const BASELINE_TYPE = "PROFIT_ORDER_STOCK_BASELINE";
const REBUILD_NUMBER = "PROFIT-REBUILD-20260818";

async function readAudit() {
  const response = await fetch("http://127.0.0.1:3001/api/inventory/overseas-stock-audit");
  if (!response.ok) throw new Error(`库存审计接口失败：${response.status}`);
  return response.json();
}

async function main() {
  if (process.argv[2] !== "--apply") {
    throw new Error("该脚本会更新库存。请显式使用 --apply 执行。");
  }
  const audit = await readAudit();
  if (audit.coverage.missingWarehouseOrders || audit.coverage.missingSkuOrders) {
    throw new Error(`存在未映射订单，拒绝校准：仓库 ${audit.coverage.missingWarehouseOrders}，SKU ${audit.coverage.missingSkuOrders}`);
  }
  const rows = audit.warehouses.flatMap((warehouse) => warehouse.rows.map((row) => ({
    ...row,
    warehouseName: warehouse.name,
  }))).filter((row) => row.hasStockRecord);
  if (rows.length !== 6 || audit.summary.differenceQty !== 4011 || audit.summary.expectedQty !== 43906) {
    throw new Error(`审计结果不符合已确认快照：SKU ${rows.length}，差异 ${audit.summary.differenceQty}，应有 ${audit.summary.expectedQty}`);
  }
  const baselineExists = await prisma.stockLog.count({ where: { relatedOrderType: BASELINE_TYPE } });
  if (baselineExists > 0) throw new Error("利润订单库存基线已存在，拒绝重复校准。");

  const before = await prisma.stock.findMany({
    where: { OR: rows.map((row) => ({ warehouseId: row.warehouseId, variantId: row.variantId })) },
    select: {
      warehouseId: true, variantId: true, qty: true, availableQty: true, reservedQty: true,
      variant: { select: { skuId: true, costPrice: true, currency: true } },
      warehouse: { select: { name: true } },
    },
  });
  if (before.length !== rows.length) throw new Error("库存记录数量变化，拒绝校准。");
  const beforeByKey = new Map(before.map((stock) => [`${stock.warehouseId}\u0000${stock.variantId}`, stock]));
  const snapshot = {
    createdAt: new Date().toISOString(),
    type: "PROFIT_ORDER_STOCK_REBUILD",
    auditSummary: audit.summary,
    rows: rows.map((row) => ({
      ...row,
      before: beforeByKey.get(`${row.warehouseId}\u0000${row.variantId}`),
    })),
  };
  const backupDirectory = "/srv/smart-erp/backups/stock";
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupFile = path.join(backupDirectory, "profit-order-stock-rebuild-20260818.json");
  if (fs.existsSync(backupFile)) throw new Error(`备份文件已存在，拒绝覆盖：${backupFile}`);
  const temporaryBackup = `${backupFile}.tmp`;
  fs.writeFileSync(temporaryBackup, JSON.stringify(snapshot, null, 2));
  fs.renameSync(temporaryBackup, backupFile);

  const operationTime = new Date();
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const key = `${row.warehouseId}\u0000${row.variantId}`;
      const current = await tx.stock.findUnique({
        where: { variantId_warehouseId: { warehouseId: row.warehouseId, variantId: row.variantId } },
        include: { variant: { select: { costPrice: true, currency: true } } },
      });
      const expectedBefore = beforeByKey.get(key);
      if (!current || !expectedBefore || current.qty !== expectedBefore.qty || current.availableQty !== expectedBefore.availableQty) {
        throw new Error(`库存已变化，拒绝覆盖：${row.warehouseName} / ${row.skuId}`);
      }
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`profit-stock-rebuild:${row.warehouseId}:${row.variantId}`}))`;
      const unitCost = new Prisma.Decimal(current.variant.costPrice || 0);
      const currency = current.variant.currency || "CNY";
      const openingQty = Number(row.openingQty);
      const expectedQty = Number(row.expectedQty);
      const reservedQty = Math.min(current.reservedQty, expectedQty);
      const baselineQty = openingQty - current.qty;

      await tx.stock.update({
        where: { id: current.id },
        data: { qty: openingQty, availableQty: openingQty - Math.min(current.reservedQty, openingQty) },
      });
      await tx.stockLog.create({
        data: {
          warehouseId: row.warehouseId,
          variantId: row.variantId,
          movementType: "STOCKTAKE",
          reason: "STOCKTAKE_ADJUSTMENT",
          qty: baselineQty,
          qtyBefore: current.qty,
          qtyAfter: openingQty,
          unitCost,
          totalCost: unitCost.mul(openingQty),
          currency,
          operator: "系统库存校准",
          operationDate: operationTime,
          relatedOrderType: BASELINE_TYPE,
          relatedOrderNumber: REBUILD_NUMBER,
          notes: "利润核算真实订单重建期初。旧 TikTok 自动扣减流水保留，仅作为历史追溯。",
        },
      });

      let balance = openingQty;
      for (const [units, orderType, label] of [
        [Number(row.salesUnits), "PROFIT_SALES_ORDER_REBUILD", "真实销售订单出库"],
        [Number(row.sampleUnits), "PROFIT_SAMPLE_ORDER_REBUILD", "达人免费样品出库"],
      ]) {
        if (!units) continue;
        const nextBalance = balance - units;
        await tx.stockLog.create({
          data: {
            warehouseId: row.warehouseId,
            variantId: row.variantId,
            movementType: "DOMESTIC_OUTBOUND",
            reason: "SALE_OUTBOUND",
            qty: -units,
            qtyBefore: balance,
            qtyAfter: nextBalance,
            unitCost,
            totalCost: unitCost.mul(-units),
            currency,
            operator: "系统库存校准",
            operationDate: new Date(operationTime.getTime() + 1),
            relatedOrderType: orderType,
            relatedOrderNumber: REBUILD_NUMBER,
            notes: `${label}：按利润核算的仓库切换与组合 SKU 映射汇总重建。`,
          },
        });
        balance = nextBalance;
      }
      if (balance !== expectedQty) throw new Error(`重建数量不平：${row.warehouseName} / ${row.skuId}`);
      await tx.stock.update({
        where: { id: current.id },
        data: { qty: expectedQty, reservedQty, availableQty: expectedQty - reservedQty },
      });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

  console.log(JSON.stringify({
    success: true,
    backupFile,
    beforeQty: audit.summary.currentQty,
    afterQty: audit.summary.expectedQty,
    salesUnits: audit.summary.salesUnits,
    sampleUnits: audit.summary.sampleUnits,
    skuCount: rows.length,
  }, null, 2));
}

main().catch((error) => { console.error(error?.message || error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
