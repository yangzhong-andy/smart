import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMercadoLivreShipment } from "@/lib/mercado-livre-api";
import { withFreshMercadoLivreToken } from "@/lib/mercado-livre-token-service";
import { createWarehouseResolver } from "@/lib/profit-warehouse-mapping";

/** Mercado Livre 的“已发货”边界：只有包裹已经离开卖家履约环节才扣库存。 */
const DEDUCT_SHIPMENT_STATUSES = new Set(["SHIPPED", "DELIVERED", "NOT_DELIVERED"]);
const RESTORE_ORDER_STATUSES = new Set(["CANCELLED", "CANCELED"]);

export type MercadoLivreStockAction = "deduct" | "restore" | "ignore";

export function mercadoLivreOrderAction(status: string | null | undefined, shipmentStatus?: string | null): MercadoLivreStockAction {
  const orderStatus = String(status || "").trim().toUpperCase();
  if (RESTORE_ORDER_STATUSES.has(orderStatus) || orderStatus.includes("CANCEL")) return "restore";
  const normalizedShipment = String(shipmentStatus || "").trim().toUpperCase().replace(/-/g, "_");
  return DEDUCT_SHIPMENT_STATUSES.has(normalizedShipment) ? "deduct" : "ignore";
}

function skuKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function safeQty(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

async function restoreMercadoLivreStock(orderId: string) {
  return prisma.$transaction(async (tx) => {
    const deductions = await tx.platformStockDeduction.findMany({
      where: { platform: "MERCADO_LIVRE", orderId, status: "deducted" },
      orderBy: { createdAt: "asc" },
    });
    if (deductions.length === 0) {
      return { skipped: true, reason: "没有待回补的 Mercado Livre 库存扣减", results: [] };
    }

    const results: Array<Record<string, unknown>> = [];
    for (const deduction of deductions) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${deduction.warehouseId}:${deduction.variantId}`}))`;
      const stock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId: deduction.variantId, warehouseId: deduction.warehouseId } },
        include: { variant: { select: { costPrice: true, currency: true } } },
      });
      if (!stock) throw new Error(`Mercado Livre 订单 ${orderId} 的库存记录不存在，取消回补已回滚`);

      const claimed = await tx.platformStockDeduction.updateMany({
        where: { id: deduction.id, status: "deducted" },
        data: { status: "reverted" },
      });
      if (claimed.count === 0) continue;

      const qtyBefore = stock.qty;
      const updated = await tx.stock.update({
        where: { id: stock.id },
        data: { qty: { increment: deduction.qty }, availableQty: { increment: deduction.qty } },
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
          relatedOrderType: "MERCADO_LIVRE_ORDER_CANCELLED",
          relatedOrderNumber: orderId,
          notes: `Mercado Livre 取消/退回订单自动回补 ${deduction.sellerSku || ""}`.trim(),
        },
      });
      results.push({ sku: deduction.sellerSku, status: "reverted", qty: deduction.qty, warehouseId: deduction.warehouseId, qtyBefore, qtyAfter: updated.qty });
    }
    return { success: true, results };
  });
}

async function getShipmentStatus(accountId: string, shippingId: string | null) {
  if (!shippingId) return null;
  try {
    const shipment = await withFreshMercadoLivreToken(accountId, (token) => getMercadoLivreShipment(token, shippingId));
    return String(shipment?.status || "").trim() || null;
  } catch (error) {
    console.warn(`[Mercado Livre stock] 无法读取物流 ${shippingId} 状态，跳过库存扣减`, error);
    return null;
  }
}

async function deductMercadoLivreStock(orderId: string, knownShipmentStatus?: string | null) {
  const order = await prisma.mercadoLivreOrder.findUnique({
    where: { id: orderId },
    include: {
      account: { select: { id: true, userId: true, country: true } },
      items: { select: { sellerSku: true, quantity: true } },
    },
  });
  if (!order) return { skipped: true, reason: "Mercado Livre 订单不存在" };
  if (!order.dateCreated) return { skipped: true, reason: "Mercado Livre 订单缺少下单时间" };

  const activation = await prisma.platformStockActivation.findUnique({
    where: { platform_shopId: { platform: "MERCADO_LIVRE", shopId: order.account.userId } },
  });
  if (!activation?.enabled) return { skipped: true, reason: "Mercado Livre 店铺库存自动扣减尚未启用" };
  if (order.dateCreated < activation.activeFrom) return { skipped: true, reason: "订单早于 Mercado Livre 库存启用时间" };

  const shipmentId = order.shippingId || (order.rawData as any)?.shipping?.id?.toString() || null;
  const shipmentStatus = knownShipmentStatus === undefined
    ? await getShipmentStatus(order.account.id, shipmentId)
    : knownShipmentStatus;
  if (mercadoLivreOrderAction(order.status, shipmentStatus) !== "deduct") {
    return { skipped: true, reason: `物流状态 ${shipmentStatus || "UNKNOWN"} 暂未达到发货扣库存条件` };
  }

  const [switchRules, mappings] = await Promise.all([
    prisma.profitWarehouseSwitchRule.findMany({
      where: { platform: "MERCADO_LIVRE", shopId: order.account.userId },
      select: { platform: true, region: true, shopId: true, externalWarehouseId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true },
    }),
    prisma.profitSkuMapping.findMany({
      where: { platform: "MERCADO_LIVRE", shopId: order.account.userId, enabled: true },
      select: { sellerSku: true, components: { select: { variantId: true, quantity: true } } },
    }),
  ]);
  const resolution = createWarehouseResolver([], switchRules)(order.rawData, order.account.userId, order.dateCreated, "MERCADO_LIVRE", order.account.country, order.externalOrderId);
  if (!resolution.warehouseId || resolution.status !== "mapped") return { skipped: true, reason: `Mercado Livre 订单未匹配店铺仓库规则（${resolution.status}）` };

  const mappingBySku = new Map(mappings.map((mapping) => [skuKey(mapping.sellerSku), mapping.components]));
  const components = new Map<string, { sellerSkus: string[]; qty: number }>();
  const results: Array<Record<string, unknown>> = [];
  for (const item of order.items) {
    const sellerSku = String(item.sellerSku || "").trim();
    const quantity = safeQty(item.quantity);
    if (!sellerSku || quantity <= 0) continue;
    const mapped = mappingBySku.get(skuKey(sellerSku)) || [];
    if (mapped.length === 0) {
      results.push({ sku: sellerSku, status: "no_mapping", reason: "Mercado Livre SKU 未配置平台映射" });
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${resolution.warehouseId}:${variantId}`}))`;
      const existing = await tx.platformStockDeduction.findUnique({ where: { platform_orderId_variantId: { platform: "MERCADO_LIVRE", orderId: order.externalOrderId, variantId } } });
      if (existing) return { sku: component.sellerSkus.join(","), status: "skipped", reason: "已处理过库存" };
      const stock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId, warehouseId: resolution.warehouseId! } },
        include: { variant: { select: { costPrice: true, currency: true } } },
      });
      if (!stock) return { sku: component.sellerSkus.join(","), status: "no_stock", reason: "库存记录不存在" };
      if (stock.qty < component.qty || stock.availableQty < component.qty) return { sku: component.sellerSkus.join(","), status: "insufficient_stock", reason: `库存不足（库内 ${stock.qty}，可用 ${stock.availableQty}，需扣 ${component.qty}）` };
      const qtyBefore = stock.qty;
      const qtyAfter = stock.qty - component.qty;
      await tx.stock.update({ where: { id: stock.id }, data: { qty: qtyAfter, availableQty: stock.availableQty - component.qty } });
      const unitCost = new Prisma.Decimal(stock.variant.costPrice || 0);
      await tx.stockLog.create({
        data: {
          variantId,
          warehouseId: resolution.warehouseId!,
          movementType: "DOMESTIC_OUTBOUND",
          reason: "SALE_OUTBOUND",
          qty: -component.qty,
          qtyBefore,
          qtyAfter,
          unitCost,
          totalCost: unitCost.mul(-component.qty),
          currency: stock.variant.currency || "CNY",
          operationDate: new Date(),
          relatedOrderId: order.externalOrderId,
          relatedOrderType: "MERCADO_LIVRE_ORDER",
          relatedOrderNumber: order.externalOrderId,
          notes: `Mercado Livre 已发货订单自动扣减：${component.sellerSkus.join(", ")}`,
        },
      });
      await tx.platformStockDeduction.create({ data: { platform: "MERCADO_LIVRE", orderId: order.externalOrderId, shopId: order.account.userId, warehouseId: resolution.warehouseId!, variantId, sellerSku: component.sellerSkus.join(","), qty: component.qty, status: "deducted", orderCreateTime: order.dateCreated } });
      return { sku: component.sellerSkus.join(","), status: "deducted", qty: component.qty, warehouseId: resolution.warehouseId, qtyBefore, qtyAfter };
    });
    results.push(result);
  }
  return { success: true, shipmentStatus, warehouseId: resolution.warehouseId, results };
}

/** 同步和 webhook 可重复调用；库存失败不会回滚平台订单。 */
export async function reconcileMercadoLivreStockForOrder(orderId: string) {
  const order = await prisma.mercadoLivreOrder.findUnique({
    where: { id: orderId },
    select: { id: true, externalOrderId: true, accountId: true, status: true, shippingId: true, rawData: true },
  });
  if (!order) return { skipped: true, reason: "Mercado Livre 订单不存在" };
  if (RESTORE_ORDER_STATUSES.has(String(order.status || "").trim().toUpperCase()) || String(order.status || "").toUpperCase().includes("CANCEL")) return restoreMercadoLivreStock(order.externalOrderId);
  const shipmentStatus = await getShipmentStatus(order.accountId, order.shippingId || (order.rawData as any)?.shipping?.id?.toString() || null);
  if (mercadoLivreOrderAction(order.status, shipmentStatus) === "ignore") return { skipped: true, reason: `物流状态 ${shipmentStatus || "UNKNOWN"} 暂未达到发货扣库存条件` };
  return deductMercadoLivreStock(order.id, shipmentStatus);
}
