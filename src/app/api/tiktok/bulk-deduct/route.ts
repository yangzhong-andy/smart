import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/tiktok/bulk-deduct
 * 重新批量补扣历史订单库存（修复版）
 * 数量 = line_items 中相同SKU的出现次数（不是quantity字段）
 */
export async function POST(request: NextRequest) {
  try {
    // 先清除所有旧的扣减记录和库存日志，恢复库存
    console.log("[TikTok Bulk] 步骤1: 恢复历史扣减的库存...");

    // 获取所有TikTok扣减记录，按仓库+变体汇总
    const oldDeductions = await prisma.tikTokStockDeduction.groupBy({
      by: ['warehouseId', 'variantId'],
      _sum: { qty: true },
    });

    // 恢复库存（加回去）
    for (const d of oldDeductions) {
      const stock = await prisma.stock.findUnique({
        where: { variantId_warehouseId: { variantId: d.variantId, warehouseId: d.warehouseId } },
      });
      if (stock) {
        await prisma.stock.update({
          where: { id: stock.id },
          data: {
            qty: stock.qty + (d._sum.qty || 0),
            availableQty: stock.availableQty + (d._sum.qty || 0),
          },
        });
      }
    }

    // 删除旧的扣减记录和日志
    await prisma.tikTokStockDeduction.deleteMany({});
    await prisma.stockLog.deleteMany({ where: { relatedOrderType: "TIKTOK_ORDER" } });
    console.log("[TikTok Bulk] 已恢复库存并清除旧记录");

    // 步骤2: 重新扣减
    console.log("[TikTok Bulk] 步骤2: 重新计算并扣减...");

    const orders = await prisma.tikTokOrder.findMany({
      where: {
        status: { in: ["DELIVERED", "COMPLETED", "IN_TRANSIT", "AWAITING_COLLECTION"] },
      },
      select: { orderId: true, shopId: true, rawData: true },
    });

    console.log(`[TikTok Bulk] 找到 ${orders.length} 个已发货订单`);

    const warehouseMappings = await prisma.tikTokWarehouseMapping.findMany();
    const warehouseMap = new Map(warehouseMappings.map(m => [m.tiktokWarehouseId, m.warehouseId]));

    const skuMappings = await prisma.tikTokSkuMapping.findMany();
    const skuMap = new Map(skuMappings.map(m => [`${m.tiktokShopId}_${m.sellerSku}`, m.variantId]));

    let deducted = 0;
    let skipped = 0;
    let errors = 0;
    const stats: Record<string, number> = {};

    for (const order of orders) {
      const raw = order.rawData as any;
      if (!raw) { skipped++; continue; }

      const tiktokWarehouseId = raw.warehouse_id;
      const trackingNumber = raw.tracking_number;
      const shippingProvider = raw.shipping_provider;
      const lineItems = raw.line_items || [];

      if (!trackingNumber) { skipped++; continue; }
      if (!tiktokWarehouseId) { skipped++; continue; }

      const warehouseId = warehouseMap.get(tiktokWarehouseId);
      if (!warehouseId) { skipped++; continue; }

      // 按 seller_sku 统计数量（每个line_item代表1件，相同SKU累加）
      const skuQtyMap = new Map<string, number>();
      for (const item of lineItems) {
        const sellerSku = item.seller_sku;
        if (!sellerSku) continue;
        skuQtyMap.set(sellerSku, (skuQtyMap.get(sellerSku) || 0) + 1);
      }

      for (const [sellerSku, qty] of skuQtyMap) {
        const variantId = skuMap.get(`${order.shopId}_${sellerSku}`);
        if (!variantId) {
          skipped++;
          stats[`未映射:${sellerSku}`] = (stats[`未映射:${sellerSku}`] || 0) + qty;
          continue;
        }

        try {
          const stock = await prisma.stock.findUnique({
            where: { variantId_warehouseId: { variantId, warehouseId } },
          });

          if (!stock) {
            stats[`无库存记录:${sellerSku}`] = (stats[`无库存记录:${sellerSku}`] || 0) + qty;
            skipped++;
            continue;
          }

          const qtyBefore = stock.qty;
          const qtyAfter = stock.qty - qty;

          await prisma.stock.update({
            where: { id: stock.id },
            data: {
              qty: qtyAfter,
              availableQty: Math.max(0, stock.availableQty - qty),
            },
          });

          await prisma.stockLog.create({
            data: {
              variantId, warehouseId,
              movementType: "DOMESTIC_OUTBOUND",
              reason: "SALE_OUTBOUND",
              qty: -qty, qtyBefore, qtyAfter,
              operationDate: new Date(),
              relatedOrderId: order.orderId,
              relatedOrderType: "TIKTOK_ORDER",
              notes: `TikTok订单出库 ${qty}件 (${shippingProvider || ""} ${trackingNumber || ""})`,
            },
          });

          await prisma.tikTokStockDeduction.create({
            data: {
              tiktokOrderId: order.orderId, shopId: order.shopId,
              warehouseId, variantId, sellerSku, qty, status: "deducted",
            },
          });

          deducted++;
          stats[sellerSku] = (stats[sellerSku] || 0) + qty;
        } catch (e: any) {
          errors++;
          if (errors <= 5) console.error(`[TikTok Bulk] 订单 ${order.orderId} SKU ${sellerSku} 失败:`, e.message);
        }
      }
    }

    console.log(`[TikTok Bulk] 完成! 扣减 ${deducted}, 跳过 ${skipped}, 错误 ${errors}`);

    return NextResponse.json({
      success: true,
      summary: { totalOrders: orders.length, deducted, skipped, errors, skuStats: stats },
    });
  } catch (error: any) {
    console.error("[TikTok Bulk] 全局错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
