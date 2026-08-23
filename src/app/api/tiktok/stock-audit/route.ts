import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping";

export const dynamic = "force-dynamic";

/** Read-only comparison of recorded deductions and current profit warehouse rules. */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["ADMIN", "SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  const [deductions, orders, shops, mappings, switchRules] = await Promise.all([
    prisma.tikTokStockDeduction.findMany({
      where: { status: "deducted" },
      select: { tiktokOrderId: true, shopId: true, warehouseId: true, variantId: true, sellerSku: true, qty: true },
      orderBy: { tiktokOrderId: "asc" },
    }),
    prisma.tikTokOrder.findMany({ select: { orderId: true, shopId: true, createTime: true, rawData: true } }),
    prisma.tikTokShopSetting.findMany({ select: { shopId: true, region: true } }),
    prisma.tikTokWarehouseMapping.findMany({ select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true } }),
    prisma.profitWarehouseSwitchRule.findMany({
      select: {
        platform: true, region: true, shopId: true, externalWarehouseId: true,
        warehouseId: true, effectiveFrom: true, effectiveOrderId: true,
      },
    }),
  ]);

  const shopRegion = new Map(shops.map((shop) => [shop.shopId, shop.region]));
  const orderMap = new Map(orders.map((order) => [order.orderId, order]));
  const resolver = createWarehouseResolver(mappings, switchRules);
  const mismatches: Array<Record<string, unknown>> = [];
  let missingOrders = 0;

  for (const deduction of deductions) {
    const order = orderMap.get(deduction.tiktokOrderId);
    if (!order) {
      missingOrders++;
      mismatches.push({ ...deduction, reason: "订单不存在" });
      continue;
    }
    const expected = resolver(
      order.rawData,
      order.shopId,
      order.createTime,
      "TIKTOK",
      shopRegion.get(order.shopId),
      order.orderId,
    );
    if (expected.warehouseId !== deduction.warehouseId) {
      mismatches.push({
        orderId: deduction.tiktokOrderId,
        shopId: deduction.shopId,
        sellerSku: deduction.sellerSku,
        variantId: deduction.variantId,
        qty: deduction.qty,
        recordedWarehouseId: deduction.warehouseId,
        expectedWarehouseId: expected.warehouseId,
        resolutionStatus: expected.status,
        tiktokWarehouseId: expected.tiktokWarehouseId,
      });
    }
  }

  return NextResponse.json({
    readOnly: true,
    summary: {
      deductionRows: deductions.length,
      affectedOrders: new Set(mismatches.map((row) => row.orderId).filter(Boolean)).size,
      mismatchRows: mismatches.length,
      missingOrders,
    },
    mismatches: mismatches.slice(0, 2000),
    truncated: mismatches.length > 2000,
  });
}
