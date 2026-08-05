import { prisma } from "../src/lib/prisma";
import { restoreStockForCancelledOrder } from "../src/lib/tiktok-stock-deduct";

async function main() {
  const apply = process.argv.includes("--apply");
  const cancelledOrders = await prisma.tikTokOrder.findMany({
    where: {
      OR: [{ status: "CANCELLED" }, { orderStatus: "CANCELLED" }],
    },
    select: { orderId: true },
  });
  const cancelledOrderIds = cancelledOrders.map((order) => order.orderId);

  const pending = cancelledOrderIds.length === 0
    ? []
    : await prisma.tikTokStockDeduction.findMany({
        where: {
          tiktokOrderId: { in: cancelledOrderIds },
          status: "deducted",
        },
        orderBy: [{ tiktokOrderId: "asc" }, { createdAt: "asc" }],
      });

  const totalQty = pending.reduce((sum, row) => sum + row.qty, 0);
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    orders: new Set(pending.map((row) => row.tiktokOrderId)).size,
    records: pending.length,
    qty: totalQty,
    details: pending.map((row) => ({
      orderId: row.tiktokOrderId,
      sellerSku: row.sellerSku,
      qty: row.qty,
    })),
  }, null, 2));

  if (!apply || pending.length === 0) return;

  const orderIds = [...new Set(pending.map((row) => row.tiktokOrderId))];
  let restoredQty = 0;
  for (const orderId of orderIds) {
    const result = await restoreStockForCancelledOrder(orderId);
    restoredQty += result.results.reduce((sum, row) => sum + row.qty, 0);
  }

  const remaining = await prisma.tikTokStockDeduction.count({
    where: {
      tiktokOrderId: { in: orderIds },
      status: "deducted",
    },
  });
  if (remaining !== 0) {
    throw new Error(`仍有 ${remaining} 条取消订单库存未回补`);
  }

  console.log(JSON.stringify({ success: true, restoredQty, remaining }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
