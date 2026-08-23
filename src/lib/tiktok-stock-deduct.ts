import { prisma } from "@/lib/prisma";
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping";
import { quantityBySellerSku } from "@/lib/tiktok-order-quantity";

/**
 * TikTok 订单库存扣减逻辑
 *
 * 触发条件：订单状态为 AWAITING_COLLECTION（待揽收）且有物流信息
 * 扣减规则：
 *   1. 使用利润核算相同的仓库切换历史确定实际发货仓
 *   2. 根据订单商品的 seller_sku 找到系统 variant（组合 SKU 优先拆成内部组件）
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
    select: { rawData: true, createTime: true },
  });
  if (!order?.rawData) {
    return { skipped: true, reason: "订单详情不存在" };
  }

  const raw = order.rawData as any;
  const lineItems = raw.line_items || [];

  if (lineItems.length === 0) {
    return { skipped: true, reason: "订单无商品明细" };
  }

  const [shop, warehouseMappings, warehouseSwitchRules, profitSkuMappings, legacySkuMappings] = await Promise.all([
    prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { region: true } }),
    prisma.tikTokWarehouseMapping.findMany({ select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true } }),
    prisma.profitWarehouseSwitchRule.findMany({
      select: { platform: true, region: true, shopId: true, externalWarehouseId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
    }),
    prisma.profitSkuMapping.findMany({
      where: { platform: "TIKTOK", shopId },
      include: { components: { select: { variantId: true, quantity: true } } },
    }),
    prisma.tikTokSkuMapping.findMany({ where: { tiktokShopId: shopId }, select: { sellerSku: true, variantId: true } }),
  ]);
  const resolveWarehouse = createWarehouseResolver(warehouseMappings, warehouseSwitchRules);
  const warehouse = resolveWarehouse(raw, shopId, order.createTime, "TIKTOK", shop?.region || undefined, orderId);
  if (!warehouse.warehouseId) {
    return { skipped: true, reason: `订单仓库未匹配（${warehouse.status}）` };
  }
  const warehouseId = warehouse.warehouseId;
  const profitSkuBySellerSku = new Map(profitSkuMappings.map((mapping) => [mapping.sellerSku, mapping]));
  const legacyVariantBySellerSku = new Map(legacySkuMappings.map((mapping) => [mapping.sellerSku, mapping.variantId]));

  // 4. 先汇总内部 SKU。不同销售 SKU 包含同一内部 SKU 时只扣一次总数量。
  const results: any[] = [];
  const variantQuantities = new Map<string, number>();
  const sellerSkusByVariant = new Map<string, string[]>();
  for (const [sellerSku, sellerQty] of quantityBySellerSku(lineItems)) {
    const profitMapping = profitSkuBySellerSku.get(sellerSku);
    const components = profitMapping?.components.length
      ? profitMapping.components.map((component) => ({ variantId: component.variantId, qty: sellerQty * component.quantity }))
      : legacyVariantBySellerSku.has(sellerSku)
        ? [{ variantId: legacyVariantBySellerSku.get(sellerSku)!, qty: sellerQty }]
        : [];
    if (components.length === 0) {
      results.push({ sku: sellerSku, status: "no_mapping", reason: "SKU 未配置映射" });
      continue;
    }

    for (const component of components) {
      variantQuantities.set(component.variantId, (variantQuantities.get(component.variantId) || 0) + component.qty);
      sellerSkusByVariant.set(component.variantId, [...(sellerSkusByVariant.get(component.variantId) || []), sellerSku]);
    }
  }

  for (const [variantId, qty] of variantQuantities) {
    const sellerSku = [...new Set(sellerSkusByVariant.get(variantId) || [])].join(" + ");
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
