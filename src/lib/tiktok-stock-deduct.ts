import { prisma } from "@/lib/prisma";

/**
 * TikTok 订单库存扣减逻辑
 *
 * 触发条件：订单状态为 AWAITING_COLLECTION（待揽收）且有物流信息
 * 扣减规则：
 *   1. 根据 TikTok warehouse_id 找到系统仓库
 *   2. 根据订单商品的 seller_sku 找到系统 variant（通过 SKU 映射表）
 *   3. 扣减 Stock 表的 qty 和 availableQty
 *   4. 记录 StockLog 和 TikTokStockDeduction
 *   5. 已扣减过的订单不会重复扣（通过 TikTokStockDeduction 唯一约束）
 */
export async function deductStockForOrder(orderId: string, shopId: string, orderData: any) {
  if (process.env.ENABLE_AUTOMATIC_STOCK_DEDUCTION !== "true") {
    return { skipped: true, reason: "海外仓期初盘点完成前，自动扣库存已关闭", results: [] };
  }

  // 1. 检查触发条件：待揽收 + 有物流信息
  const status = orderData.order_status || orderData.status;
  const trackingNumber = orderData.tracking_number;
  const shippingProvider = orderData.shipping_provider;

  if (status !== "AWAITING_COLLECTION") {
    return { skipped: true, reason: `状态 ${status} 不是待揽收，跳过` };
  }
  if (!trackingNumber && !shippingProvider) {
    return { skipped: true, reason: "无物流信息，跳过" };
  }

  // 2. 获取订单完整详情（含 line_items）
  const order = await prisma.tikTokOrder.findUnique({
    where: { orderId },
    select: { rawData: true },
  });
  if (!order?.rawData) {
    return { skipped: true, reason: "订单详情不存在" };
  }

  const raw = order.rawData as any;
  const tiktokWarehouseId = raw.warehouse_id;
  const lineItems = raw.line_items || [];

  if (!tiktokWarehouseId) {
    return { skipped: true, reason: "订单无 warehouse_id" };
  }
  if (lineItems.length === 0) {
    return { skipped: true, reason: "订单无商品明细" };
  }

  // 按 seller_sku 统计数量（每个line_item代表1件，相同SKU累加）
  const skuQtyMap = new Map<string, number>();
  for (const item of lineItems) {
    const sellerSku = item.seller_sku;
    if (!sellerSku) continue;
    skuQtyMap.set(sellerSku, (skuQtyMap.get(sellerSku) || 0) + 1);
  }

  // 3. 查仓库映射
  const warehouseMapping = await prisma.tikTokWarehouseMapping.findUnique({
    where: { tiktokWarehouseId },
  });
  if (!warehouseMapping) {
    return { skipped: true, reason: `warehouse_id ${tiktokWarehouseId} 未配置映射` };
  }
  const warehouseId = warehouseMapping.warehouseId;

  // 4. 按 SKU 数量逐个扣库存
  const results: any[] = [];
  for (const [sellerSku, qty] of skuQtyMap) {
    // 查 SKU 映射
    const skuMapping = await prisma.tikTokSkuMapping.findFirst({
      where: { tiktokShopId: shopId, sellerSku },
    });
    if (!skuMapping) {
      results.push({ sku: sellerSku, status: "no_mapping", reason: "SKU 未配置映射" });
      continue;
    }
    const variantId = skuMapping.variantId;

    // 库存、日志和防重复记录必须一起成功或一起回滚。
    const result = await prisma.$transaction(async (tx) => {
      const existingDeduction = await tx.tikTokStockDeduction.findFirst({
        where: { tiktokOrderId: orderId, variantId },
      });
      if (existingDeduction) {
        return { sku: sellerSku, status: "skipped", reason: "已处理过库存" };
      }

      const stock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
      });
      if (!stock) {
        return { sku: sellerSku, status: "no_stock", reason: "库存记录不存在" };
      }
      if (stock.qty < qty || stock.availableQty < qty) {
        return {
          sku: sellerSku,
          status: "insufficient_stock",
          reason: `库存不足（库内 ${stock.qty}，可用 ${stock.availableQty}，需扣 ${qty}）`,
        };
      }

      const qtyBefore = stock.qty;
      const qtyAfter = stock.qty - qty;
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: qtyAfter,
          availableQty: stock.availableQty - qty,
        },
      });

      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId,
          movementType: "DOMESTIC_OUTBOUND",
          reason: "SALE_OUTBOUND",
          qty: -qty,
          qtyBefore,
          qtyAfter,
          operationDate: new Date(),
          relatedOrderId: orderId,
          relatedOrderType: "TIKTOK_ORDER",
          notes: `TikTok订单自动扣减 (${shippingProvider || ""} ${trackingNumber || ""})`,
        },
      });

      await tx.tikTokStockDeduction.create({
        data: {
          tiktokOrderId: orderId,
          shopId,
          warehouseId,
          variantId,
          sellerSku,
          qty,
          status: "deducted",
        },
      });

      return {
        sku: sellerSku,
        status: "deducted",
        qty,
        warehouse: warehouseId,
        qtyBefore,
        qtyAfter,
      };
    });

    results.push(result);
    if (result.status === "deducted") {
      console.log(`[TikTok Stock] ✅ 扣减: ${sellerSku} -${qty} (仓库库存 ${result.qtyBefore}→${result.qtyAfter})`);
    }
  }

  return { success: true, results };
}

/**
 * 已取消订单自动回补库存。
 *
 * 扣减记录会先从 deducted 原子地改为 reverted，因此 webhook、定时同步或
 * 人工补偿重复触发时都不会重复增加库存。
 */
export async function restoreStockForCancelledOrder(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const deductions = await tx.tikTokStockDeduction.findMany({
      where: { tiktokOrderId: orderId, status: "deducted" },
      orderBy: { createdAt: "asc" },
    });

    if (deductions.length === 0) {
      return { skipped: true, reason: "没有待回补的库存扣减", results: [] };
    }

    const results: any[] = [];
    for (const deduction of deductions) {
      const stock = await tx.stock.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: deduction.variantId,
            warehouseId: deduction.warehouseId,
          },
        },
      });
      if (!stock) {
        throw new Error(`订单 ${orderId} 的库存记录不存在，取消回补已整体回滚`);
      }

      const claimed = await tx.tikTokStockDeduction.updateMany({
        where: { id: deduction.id, status: "deducted" },
        data: { status: "reverted" },
      });
      if (claimed.count === 0) continue;

      const qtyBefore = stock.qty;
      const updated = await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: { increment: deduction.qty },
          availableQty: { increment: deduction.qty },
        },
      });

      await tx.stockLog.create({
        data: {
          variantId: deduction.variantId,
          warehouseId: deduction.warehouseId,
          movementType: "ADJUSTMENT",
          reason: "RETURN_INBOUND",
          qty: deduction.qty,
          qtyBefore,
          qtyAfter: updated.qty,
          operationDate: new Date(),
          relatedOrderId: orderId,
          relatedOrderType: "TIKTOK_ORDER_CANCELLED",
          notes: `TikTok取消订单自动回补 ${deduction.sellerSku || ""}`.trim(),
        },
      });

      results.push({
        sku: deduction.sellerSku,
        status: "reverted",
        qty: deduction.qty,
        warehouse: deduction.warehouseId,
        qtyBefore,
        qtyAfter: updated.qty,
      });
    }

    return { success: true, results };
  });
}
