import { prisma } from "@/lib/prisma";
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping";

/**
 * TikTok 订单库存扣减逻辑
 *
 * 触发条件：订单已进入待揽收或更后的发货状态
 * 扣减规则：
 *   1. 根据利润核算的店铺切仓历史找到系统仓库
 *   2. 根据利润 SKU BOM 把 seller_sku 展开为内部 variant 组件
 *   3. 扣减 Stock 表的 qty 和 availableQty
 *   4. 记录 StockLog 和 TikTokStockDeduction
 *   5. 已扣减过的订单不会重复扣（通过 TikTokStockDeduction 唯一约束）
 */
const TIKTOK_STOCK_OUTBOUND_STATUSES = new Set([
  "AWAITING_COLLECTION",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
]);

export function isTikTokStockOutboundStatus(status: string | null | undefined) {
  return TIKTOK_STOCK_OUTBOUND_STATUSES.has(String(status || "").trim().toUpperCase());
}

export async function deductStockForOrder(orderId: string, shopId: string, orderData: any) {
  // 1. A delayed webhook/sync may first observe an order after awaiting collection.
  // Accept every later shipped state; the deduction table remains idempotent.
  const status = String(orderData.order_status || orderData.status || "").trim().toUpperCase();

  if (!isTikTokStockOutboundStatus(status)) {
    return { skipped: true, reason: `状态 ${status || "未知"} 尚未达到出库状态，跳过` };
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

  // 按 seller_sku 统计数量（每个line_item代表1件，相同SKU累加）
  const skuQtyMap = new Map<string, number>();
  for (const item of lineItems) {
    const sellerSku = item.seller_sku;
    if (!sellerSku) continue;
    skuQtyMap.set(sellerSku, (skuQtyMap.get(sellerSku) || 0) + 1);
  }

  // 3. Resolve the same effective-dated warehouse history used by profit.
  const [warehouseMappings, switchRules, profitMappings, directMappings] = await Promise.all([
    prisma.tikTokWarehouseMapping.findMany({ select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true } }),
    prisma.profitWarehouseSwitchRule.findMany({ where: { platform: "TIKTOK", shopId }, select: { platform: true, region: true, shopId: true, externalWarehouseId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true } }),
    prisma.profitSkuMapping.findMany({ where: { platform: "TIKTOK", shopId, enabled: true }, select: { sellerSku: true, components: { select: { variantId: true, quantity: true } } } }),
    prisma.tikTokSkuMapping.findMany({ where: { tiktokShopId: shopId }, select: { sellerSku: true, variantId: true } }),
  ]);
  const resolver = createWarehouseResolver(warehouseMappings, switchRules);
  const resolution = resolver(raw, shopId, order.createTime, "TIKTOK", null, orderId);
  const warehouseId = resolution.warehouseId;
  if (!warehouseId || resolution.status !== "mapped") {
    return { skipped: true, reason: `订单未匹配利润切仓规则（${resolution.status}）` };
  }
  const warehouseBaseline = await prisma.stockLog.findFirst({
    where: { warehouseId, relatedOrderType: "PROFIT_ORDER_STOCK_BASELINE" },
    select: { operationDate: true },
    orderBy: { operationDate: "asc" },
  });
  if (!warehouseBaseline) {
    return { skipped: true, reason: "该仓库尚未建立利润订单库存基线" };
  }
  if (order.createTime && order.createTime <= warehouseBaseline.operationDate) {
    return { skipped: true, reason: "订单已包含在利润订单库存基线中" };
  }
  const profitMap = new Map(profitMappings.map((mapping) => [mapping.sellerSku.trim().toLowerCase(), mapping.components.map((component) => ({ variantId: component.variantId, quantity: component.quantity }))]));
  const directMap = new Map(directMappings.map((mapping) => [mapping.sellerSku.trim().toLowerCase(), [{ variantId: mapping.variantId, quantity: 1 }]]));

  // 4. Expand seller SKUs and aggregate internal component quantities.
  const results: any[] = [];
  const componentQtyMap = new Map<string, { sellerSkus: string[]; qty: number }>();
  for (const [sellerSku, qty] of skuQtyMap) {
    const components = profitMap.get(sellerSku.trim().toLowerCase()) || directMap.get(sellerSku.trim().toLowerCase()) || [];
    if (components.length === 0) {
      results.push({ sku: sellerSku, status: "no_mapping", reason: "利润 SKU 未配置映射" });
      continue;
    }
    for (const component of components) {
      const current = componentQtyMap.get(component.variantId) || { sellerSkus: [], qty: 0 };
      current.qty += qty * Math.max(1, Number(component.quantity || 1));
      if (!current.sellerSkus.includes(sellerSku)) current.sellerSkus.push(sellerSku);
      componentQtyMap.set(component.variantId, current);
    }
  }

  // 5. 按内部组件扣库存；旧 TikTokStockDeduction 记录只用于幂等和历史追溯。
  for (const [variantId, component] of componentQtyMap) {
    const qty = component.qty;

    // 库存、日志和防重复记录必须一起成功或一起回滚。
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${warehouseId}:${variantId}`}))`;

      const existingDeduction = await tx.tikTokStockDeduction.findFirst({
        where: { tiktokOrderId: orderId, variantId },
      });
      if (existingDeduction) {
        return { sku: component.sellerSkus.join(","), status: "skipped", reason: "已处理过库存" };
      }

      const stock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
      });
      if (!stock) {
        return { sku: component.sellerSkus.join(","), status: "no_stock", reason: "库存记录不存在" };
      }
      if (stock.qty < qty || stock.availableQty < qty) {
        return {
          sku: component.sellerSkus.join(","),
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
          notes: `利润订单自动扣减：${component.sellerSkus.join(", ")}`,
        },
      });

      await tx.tikTokStockDeduction.create({
        data: {
          tiktokOrderId: orderId,
          shopId,
          warehouseId,
          variantId,
          sellerSku: component.sellerSkus.join(","),
          qty,
          status: "deducted",
        },
      });

      return {
        sku: component.sellerSkus.join(","),
        status: "deducted",
        qty,
        warehouse: warehouseId,
        qtyBefore,
        qtyAfter,
      };
    });

    results.push(result);
    if (result.status === "deducted") {
      console.log(`[TikTok Stock] ✅ 扣减: ${component.sellerSkus.join(",")} -${qty} (仓库库存 ${result.qtyBefore}→${result.qtyAfter})`);
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${deduction.warehouseId}:${deduction.variantId}`}))`;

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
