import { KwaiError, kwaiId } from "./kwai-api";
const text = (v: unknown) => typeof v === "string" ? v.slice(0, 500) : "";
const sensitiveKey = /(address|receiver|consignee|recipient|phone|mobile|telephone|cpf|email|name|operator|buyer|customer|user|姓名|地址|电话|手机|收件)/i;
const coreOrderKeys = new Set(["orderId", "orderStatus", "currency", "country", "createTime", "paidTime", "totalAmount", "shippingFee", "productPlatformDiscount", "productSellerDiscount", "orderItemView"]);
function safeExtra(value: unknown, key = "", depth = 0): any {
  if (sensitiveKey.test(key) || depth > 4) return undefined;
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeExtra(item, key, depth + 1)).filter((item) => item !== undefined);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const safe = safeExtra(childValue, childKey, depth + 1);
      if (safe !== undefined) result[childKey.slice(0, 100)] = safe;
    }
    return result;
  }
  return undefined;
}
function extras(row: Record<string, unknown>): any {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (coreOrderKeys.has(key)) continue;
    const safe = safeExtra(value, key);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
}
function integer(v: unknown): number | null {
  if (v == null) return null;
  if ((typeof v !== "number" && typeof v !== "string") || (typeof v === "string" && !/^\d+$/.test(v))) throw new KwaiError("Kwai 返回的数量或金额格式异常");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new KwaiError("Kwai 返回的数量或金额格式异常");
  return n;
}
function code(v: unknown): string | number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return v.slice(0, 100);
  return null;
}
export function normalizeKwaiOrder(row: any) {
  if (!row || row.currency !== "BRL" || !["BRA", "BR"].includes(row.country)) throw new KwaiError("订单不是巴西 BRL 数据，已停止导入");
  if (!Array.isArray(row.orderItemView)) throw new KwaiError("Kwai 订单商品明细缺失");
  return {
    orderId: kwaiId(row.orderId), status: integer(row.orderStatus), currency: "BRL", createdAt: integer(row.createTime), paidAt: integer(row.paidTime),
    totalAmountCents: integer(row.totalAmount), shippingFeeCents: integer(row.shippingFee),
    productPlatformDiscountCents: integer(row.productPlatformDiscount), productSellerDiscountCents: integer(row.productSellerDiscount),
    // These are the non-sensitive business fields returned by Kwai. Values stay nullable when the platform omits them.
    cancelStatus: code(row.cancelStatus ?? row.cancelOrderStatus), cancelReason: text(row.cancelReason ?? row.closeReason), cancelledAt: integer(row.cancelTime ?? row.cancelledTime),
    afterSaleStatus: code(row.afterSaleStatus ?? row.refundStatus), deliveryType: text(row.deliveryType ?? row.shipType), deliveryStatus: code(row.deliveryStatus ?? row.shipStatus),
    trackingNumber: text(row.trackingNumber ?? row.logisticsNo ?? row.expressNo), logisticsCompany: text(row.logisticsCompany ?? row.expressCompany),
    invoiceStatus: code(row.invoiceStatus), invoiceNumber: text(row.invoiceNumber), invoiceAmountCents: integer(row.invoiceAmount),
    productAmountCents: integer(row.productAmount ?? row.goodsAmount ?? row.itemAmount), shippingDiscountCents: integer(row.shippingDiscount ?? row.shippingFeeDiscount),
    operationLogs: safeExtra(row.operationLogs ?? row.orderOperationList ?? row.operations),
    items: row.orderItemView.map((item: any) => ({
      itemId: kwaiId(item.itemId), skuId: kwaiId(item.skuId), name: text(item.itemName), skuName: text(item.skuName), sellerSku: text(item.skuNumber) || text(item.number),
      quantity: integer(item.skuQuantity), priceCents: integer(item.skuPrice), subtotalCents: integer(item.subtotal ?? item.itemAmount ?? item.totalAmount),
      imageUrl: text(item.imageUrl ?? item.itemImage ?? item.image), afterSaleStatus: code(item.afterSaleStatus ?? item.refundStatus),
      extras: extras(item),
    })),
    extras: extras(row),
  };
}
export function extractKwaiOrderDetails(data: any, expectedCount: number) {
  const rows = Array.isArray(data) ? data : data?.orderInfoDetailList;
  if (!Array.isArray(rows) || rows.length !== expectedCount) throw new KwaiError("订单详情不完整，本页未写入，请重试");
  return rows;
}
export function normalizeKwaiProduct(row: any) {
  if (!row) throw new KwaiError("Kwai 商品数据缺失");
  if (row.saleCountry && !["BRA", "BR"].includes(row.saleCountry)) throw new KwaiError("商品不是巴西站数据，已停止导入");
  return { itemId: kwaiId(row.itemId), title: text(row.title), sellerSku: text(row.number), status: integer(row.activeStatus), priceCents: integer(row.salePrice), stock: integer(row.stock), updatedAt: integer(row.updateTime), currency: "BRL" };
}
export function normalizeKwaiSkus(data: any, itemId: string) {
  if (!data || kwaiId(data.itemId) !== itemId || !Array.isArray(data.skus) || !["BRA", "BR"].includes(data.saleCountry)) throw new KwaiError("SKU 身份或站点数据不匹配");
  return data.skus.map((sku: any) => {
    if (kwaiId(sku.itemId) !== itemId) throw new KwaiError("SKU 所属商品不匹配");
    return { skuId: kwaiId(sku.skuId), sellerSku: text(sku.number), name: text(sku.skuSpecDesc), priceCents: integer(sku.skuPrice), stock: integer(sku.stock) };
  });
}
export function kwaiPage(value: unknown) {
  const page = Number(value ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new KwaiError("页码必须为 1–10000 的整数");
  return page;
}
