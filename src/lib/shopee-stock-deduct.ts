import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping";

const DEDUCT_STATUSES = new Set([
  "PROCESSED",
  "READY_TO_SHIP",
  "SHIPPED",
  "TO_CONFIRM_RECEIVE",
  "COMPLETED",
]);

export type ShopeeStockAction = "deduct" | "restore" | "ignore";

export function shopeeStockAction(status: string | null | undefined): ShopeeStockAction {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized.includes("CANCEL") || normalized === "INCOMPLETE") return "restore";
  return DEDUCT_STATUSES.has(normalized) ? "deduct" : "ignore";
}

function skuKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function itemSellerSku(item: { modelSku: string | null; itemSku: string | null }) {
  return String(item.modelSku || item.itemSku || "").trim();
}

async function restoreShopeeStock(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const deductions = await tx.platformStockDeduction.findMany({
      where: { platform: "SHOPEE", orderId, status: "deducted" },
      orderBy: { createdAt: "asc" },
    });
    if (deductions.length === 0) {
      return { skipped: true, reason: "没有待回补的 Shopee 库存扣减", results: [] };
    }

    const results: Array<Record<string, unknown>> = [];
    for (const deduction of deductions) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${deduction.warehouseId}:${deduction.variantId}`}))`;
      const stock = await tx.stock.findUnique({
        where: {
          variantId_warehouseId: {
            variantId: deduction.variantId,
            warehouseId: deduction.warehouseId,
          },
        },
        include: { variant: { select: { costPrice: true, currency: true } } },
      });
      if (!stock) throw new Error(`Shopee 订单 ${orderId} 的库存记录不存在，取消回补已回滚`);

      const claimed = await tx.platformStockDeduction.updateMany({
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
      const unitCost = new Prisma.Decimal(stock.variant.costPrice || 0);
      await tx.stockLog.create({
        data: {
          variantId: deduction.variantId,
          warehouseId: deduction.warehouseId,
          movementType: "ADJUSTMENT",
          reason: "RETURN_INBOUND",
          qty: deduction.qty,
          qtyBefore,
          qtyAfter: updated.qty,
          unitCost,
          totalCost: unitCost.mul(deduction.qty),
          currency: stock.variant.currency || "CNY",
          operationDate: new Date(),
          relatedOrderId: orderId,
          relatedOrderType: "SHOPEE_ORDER_CANCELLED",
          relatedOrderNumber: orderId,
          notes: `Shopee 取消订单自动回补 ${deduction.sellerSku || ""}`.trim(),
        },
      });
      results.push({
        sku: deduction.sellerSku,
        status: "reverted",
        qty: deduction.qty,
        warehouseId: deduction.warehouseId,
        qtyBefore,
        qtyAfter: updated.qty,
      });
    }
    return { success: true, results };
  });
}

async function deductShopeeStock(orderId: string, shopId: string) {
  const order = await prisma.shopeeOrder.findUnique({
    where: { shopId_orderSn: { shopId, orderSn: orderId } },
    include: {
      items: { select: { modelSku: true, itemSku: true, quantity: true } },
      shopSetting: { select: { region: true } },
    },
  });
  if (!order) return { skipped: true, reason: "Shopee 订单不存在" };
  if (!order.createTime) return { skipped: true, reason: "Shopee 订单缺少下单时间" };

  const activation = await prisma.platformStockActivation.findUnique({
    where: { platform_shopId: { platform: "SHOPEE", shopId } },
  });
  if (!activation?.enabled) return { skipped: true, reason: "Shopee 店铺库存自动扣减尚未启用" };
  const fulfillmentUpdateTime = order.updateTime || order.createTime;
  if (fulfillmentUpdateTime < activation.activeFrom) {
    return { skipped: true, reason: "订单履约更新时间早于 Shopee 库存启用时间，历史库存保持不变" };
  }

  const [switchRules, mappings] = await Promise.all([
    prisma.profitWarehouseSwitchRule.findMany({
      where: { platform: "SHOPEE", shopId },
      select: {
        platform: true,
        region: true,
        shopId: true,
        externalWarehouseId: true,
        warehouseId: true,
        effectiveFrom: true,
        effectiveOrderId: true,
      },
    }),
    prisma.profitSkuMapping.findMany({
      where: { platform: "SHOPEE", shopId, enabled: true },
      select: {
        sellerSku: true,
        components: { select: { variantId: true, quantity: true } },
      },
    }),
  ]);
  const resolver = createWarehouseResolver([], switchRules);
  const resolution = resolver(
    order.rawData,
    shopId,
    order.createTime,
    "SHOPEE",
    order.shopSetting.region,
    orderId,
  );
  if (!resolution.warehouseId || resolution.status !== "mapped") {
    return { skipped: true, reason: `Shopee 订单未匹配店铺仓库规则（${resolution.status}）` };
  }
  const warehouseId = resolution.warehouseId;
  const mappingBySku = new Map(mappings.map((mapping) => [skuKey(mapping.sellerSku), mapping.components]));
  const components = new Map<string, { sellerSkus: string[]; qty: number }>();
  const results: Array<Record<string, unknown>> = [];

  for (const item of order.items) {
    const sellerSku = itemSellerSku(item);
    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));
    if (!sellerSku || quantity <= 0) continue;
    const mapped = mappingBySku.get(skuKey(sellerSku)) || [];
    if (mapped.length === 0) {
      results.push({ sku: sellerSku, status: "no_mapping", reason: "Shopee SKU 未配置平台映射" });
      continue;
    }
    for (const component of mapped) {
      const current = components.get(component.variantId) || { sellerSkus: [], qty: 0 };
      current.qty += quantity * Math.max(1, Number(component.quantity || 1));
      if (!current.sellerSkus.includes(sellerSku)) current.sellerSkus.push(sellerSku);
      components.set(component.variantId, current);
    }
  }

  for (const [variantId, component] of components) {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${warehouseId}:${variantId}`}))`;
      const existing = await tx.platformStockDeduction.findUnique({
        where: {
          platform_orderId_variantId: { platform: "SHOPEE", orderId, variantId },
        },
      });
      if (existing) return { sku: component.sellerSkus.join(","), status: "skipped", reason: "已处理过库存" };

      const stock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId } },
        include: { variant: { select: { costPrice: true, currency: true } } },
      });
      if (!stock) return { sku: component.sellerSkus.join(","), status: "no_stock", reason: "库存记录不存在" };
      if (stock.qty < component.qty || stock.availableQty < component.qty) {
        return {
          sku: component.sellerSkus.join(","),
          status: "insufficient_stock",
          reason: `库存不足（库内 ${stock.qty}，可用 ${stock.availableQty}，需扣 ${component.qty}）`,
        };
      }

      const qtyBefore = stock.qty;
      const qtyAfter = stock.qty - component.qty;
      await tx.stock.update({
        where: { id: stock.id },
        data: {
          qty: qtyAfter,
          availableQty: stock.availableQty - component.qty,
        },
      });
      const unitCost = new Prisma.Decimal(stock.variant.costPrice || 0);
      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId,
          movementType: "DOMESTIC_OUTBOUND",
          reason: "SALE_OUTBOUND",
          qty: -component.qty,
          qtyBefore,
          qtyAfter,
          unitCost,
          totalCost: unitCost.mul(-component.qty),
          currency: stock.variant.currency || "CNY",
          operationDate: new Date(),
          relatedOrderId: orderId,
          relatedOrderType: "SHOPEE_ORDER",
          relatedOrderNumber: orderId,
          notes: `Shopee 订单自动扣减：${component.sellerSkus.join(", ")}`,
        },
      });
      await tx.platformStockDeduction.create({
        data: {
          platform: "SHOPEE",
          orderId,
          shopId,
          warehouseId,
          variantId,
          sellerSku: component.sellerSkus.join(","),
          qty: component.qty,
          status: "deducted",
          orderCreateTime: order.createTime,
        },
      });
      return {
        sku: component.sellerSkus.join(","),
        status: "deducted",
        qty: component.qty,
        warehouseId,
        qtyBefore,
        qtyAfter,
      };
    });
    results.push(result);
  }

  return { success: true, warehouseId, results };
}

/** Reconcile one saved Shopee order without allowing inventory failures to
 * change the source order itself. Callers can safely retry this function. */
export async function reconcileShopeeStockForOrder(orderId: string, shopId: string) {
  const order = await prisma.shopeeOrder.findUnique({
    where: { shopId_orderSn: { shopId, orderSn: orderId } },
    select: { status: true },
  });
  if (!order) return { skipped: true, reason: "Shopee 订单不存在" };
  const action = shopeeStockAction(order.status);
  if (action === "restore") return restoreShopeeStock(orderId);
  if (action === "ignore") return { skipped: true, reason: `状态 ${order.status || "UNKNOWN"} 暂不扣库存` };
  return deductShopeeStock(orderId, shopId);
}
