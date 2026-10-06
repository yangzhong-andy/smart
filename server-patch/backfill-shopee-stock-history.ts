import { prisma } from "/srv/smart-erp/baxi/current/src/lib/prisma";
import { reconcileShopeeStockForOrder } from "/srv/smart-erp/baxi/current/src/lib/shopee-stock-deduct";

const SHOP_ID = "1842551792";
const ELIGIBLE_STATUSES = [
  "READY_TO_SHIP",
  "PROCESSED",
  "SHIPPED",
  "TO_CONFIRM_RECEIVE",
  "COMPLETED",
];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const cutoff = new Date();
  const orders = await prisma.shopeeOrder.findMany({
    where: {
      shopId: SHOP_ID,
      status: { in: ELIGIBLE_STATUSES },
      createTime: { lte: cutoff },
    },
    select: { orderSn: true, createTime: true },
    orderBy: [{ createTime: "asc" }, { orderSn: "asc" }],
  });
  if (orders.length === 0) throw new Error("No eligible Shopee orders were found");

  const earliest = orders.find((order) => order.createTime)?.createTime;
  if (!earliest) throw new Error("The earliest eligible Shopee order has no creation time");
  const activeFrom = new Date(earliest.getTime() - 1_000);
  await prisma.platformStockActivation.update({
    where: { platform_shopId: { platform: "SHOPEE", shopId: SHOP_ID } },
    data: {
      enabled: true,
      activeFrom,
      notes: `已启用并补齐历史：截至 ${cutoff.toISOString()} 的有效 Shopee 订单已进入幂等库存核对`,
    },
  });

  const statusCounts = new Map<string, number>();
  const failures: Array<{ orderSn: string; error: string }> = [];
  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    try {
      const result = await reconcileShopeeStockForOrder(order.orderSn, SHOP_ID) as any;
      if (Array.isArray(result?.results) && result.results.length > 0) {
        for (const row of result.results) {
          const status = String(row?.status || "unknown");
          statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        }
      } else {
        const status = result?.skipped ? `skipped:${String(result.reason || "unknown")}` : "no_result";
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      }
    } catch (error) {
      failures.push({ orderSn: order.orderSn, error: errorMessage(error) });
    }
    if ((index + 1) % 100 === 0 || index + 1 === orders.length) {
      console.log(JSON.stringify({ progress: index + 1, total: orders.length, failures: failures.length }));
    }
  }

  const deductions = await prisma.platformStockDeduction.findMany({
    where: { platform: "SHOPEE", shopId: SHOP_ID, status: "deducted" },
    select: { orderId: true, qty: true },
  });
  const deductedOrderIds = new Set(deductions.map((row) => row.orderId));
  const missingOrderIds = orders.map((order) => order.orderSn).filter((orderSn) => !deductedOrderIds.has(orderSn));
  const stockTotal = await prisma.stock.aggregate({
    where: { warehouse: { type: "OVERSEAS" } },
    _sum: { qty: true, availableQty: true },
  });

  const summary = {
    cutoff: cutoff.toISOString(),
    activeFrom: activeFrom.toISOString(),
    eligibleOrders: orders.length,
    deductionRows: deductions.length,
    deductedOrders: deductedOrderIds.size,
    deductedUnits: deductions.reduce((sum, row) => sum + row.qty, 0),
    statusCounts: Object.fromEntries(statusCounts),
    missingOrders: missingOrderIds.length,
    missingOrderIds: missingOrderIds.slice(0, 20),
    failures: failures.length,
    failureDetails: failures.slice(0, 20),
    stockQty: stockTotal._sum.qty || 0,
    stockAvailableQty: stockTotal._sum.availableQty || 0,
  };
  console.log(JSON.stringify(summary));
  if (failures.length > 0 || missingOrderIds.length > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
