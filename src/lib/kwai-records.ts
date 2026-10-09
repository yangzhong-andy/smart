import { KwaiError, kwaiId } from "./kwai-api";
const text = (v: unknown) => typeof v === "string" ? v.slice(0, 500) : "";
function integer(v: unknown): number | null {
  if (v == null) return null;
  if ((typeof v !== "number" && typeof v !== "string") || (typeof v === "string" && !/^\d+$/.test(v))) throw new KwaiError("Kwai 返回的数量或金额格式异常");
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new KwaiError("Kwai 返回的数量或金额格式异常");
  return n;
}
export function normalizeKwaiOrder(row: any) {
  if (!row || row.currency !== "BRL" || !["BRA", "BR"].includes(row.country)) throw new KwaiError("订单不是巴西 BRL 数据，已停止导入");
  if (!Array.isArray(row.orderItemView)) throw new KwaiError("Kwai 订单商品明细缺失");
  return {
    orderId: kwaiId(row.orderId), status: integer(row.orderStatus), currency: "BRL", createdAt: integer(row.createTime), paidAt: integer(row.paidTime),
    totalAmountCents: integer(row.totalAmount), shippingFeeCents: integer(row.shippingFee),
    productPlatformDiscountCents: integer(row.productPlatformDiscount), productSellerDiscountCents: integer(row.productSellerDiscount),
    items: row.orderItemView.map((item: any) => ({ itemId: kwaiId(item.itemId), skuId: kwaiId(item.skuId), name: text(item.itemName), skuName: text(item.skuName), sellerSku: text(item.skuNumber) || text(item.number), quantity: integer(item.skuQuantity), priceCents: integer(item.skuPrice) })),
  };
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
