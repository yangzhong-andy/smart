import { Prisma } from "@prisma/client";

export const SHOPEE_ORDER_WINDOW_SECONDS = 15 * 24 * 60 * 60 - 1;

function stringValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function decimalValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(value) : null;
}

function dateValue(value: unknown): Date | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return new Date(number > 10_000_000_000 ? number : number * 1000);
}

export function splitShopeeOrderWindows(timeFrom: number, timeTo: number) {
  if (!Number.isInteger(timeFrom) || !Number.isInteger(timeTo) || timeFrom > timeTo) {
    throw new Error("Shopee order sync time range is invalid");
  }
  const windows: Array<{ timeFrom: number; timeTo: number }> = [];
  let cursor = timeFrom;
  while (cursor <= timeTo) {
    const end = Math.min(timeTo, cursor + SHOPEE_ORDER_WINDOW_SECONDS);
    windows.push({ timeFrom: cursor, timeTo: end });
    cursor = end + 1;
  }
  return windows;
}

export function shopeeIncrementalRange(
  lastSuccessfulTo: Date | null,
  nowSeconds = Math.floor(Date.now() / 1000),
  overlapSeconds = 10 * 60,
  initialDays = 30,
) {
  const checkpoint = lastSuccessfulTo ? Math.floor(lastSuccessfulTo.getTime() / 1000) : null;
  return {
    timeFrom: Math.max(0, checkpoint === null ? nowSeconds - initialDays * 24 * 60 * 60 : checkpoint - overlapSeconds),
    timeTo: nowSeconds,
  };
}

export function normalizeShopeeOrder(raw: Record<string, any>, shop: {
  id: string;
  shopId: string;
  currency: string | null;
}) {
  const orderSn = stringValue(raw.order_sn ?? raw.orderSn);
  if (!orderSn) throw new Error("Shopee order detail is missing order_sn");
  const packages = Array.isArray(raw.package_list) ? raw.package_list : [];
  const firstPackage = packages[0] || {};
  const rawItems = Array.isArray(raw.item_list) ? raw.item_list : [];

  return {
    orderSn,
    data: {
      shopSettingId: shop.id,
      shopId: shop.shopId,
      status: stringValue(raw.order_status ?? raw.status),
      currency: stringValue(raw.currency) || shop.currency,
      totalAmount: decimalValue(raw.total_amount),
      estimatedShippingFee: decimalValue(raw.estimated_shipping_fee),
      actualShippingFee: decimalValue(raw.actual_shipping_fee),
      buyerUserId: stringValue(raw.buyer_user_id),
      buyerUsername: stringValue(raw.buyer_username),
      paymentMethod: stringValue(raw.payment_method),
      shippingCarrier: stringValue(raw.shipping_carrier ?? raw.checkout_shipping_carrier ?? firstPackage.shipping_carrier),
      trackingNumber: stringValue(firstPackage.tracking_number ?? raw.tracking_number),
      createTime: dateValue(raw.create_time),
      updateTime: dateValue(raw.update_time),
      payTime: dateValue(raw.pay_time),
      shipByDate: dateValue(raw.ship_by_date),
      cancelTime: dateValue(raw.cancel_time),
      rawData: raw as Prisma.InputJsonValue,
      syncedAt: new Date(),
    },
    items: rawItems.map((item: Record<string, any>, index: number) => ({
      itemId: stringValue(item.item_id) || `line-${index + 1}`,
      modelId: stringValue(item.model_id) || "0",
      itemSku: stringValue(item.item_sku),
      modelSku: stringValue(item.model_sku),
      itemName: stringValue(item.item_name),
      modelName: stringValue(item.model_name),
      quantity: Math.max(0, Math.trunc(Number(item.model_quantity_purchased ?? item.quantity ?? 0) || 0)),
      originalPrice: decimalValue(item.model_original_price ?? item.original_price),
      discountedPrice: decimalValue(item.model_discounted_price ?? item.discounted_price),
      promotionType: stringValue(item.promotion_type),
      imageUrl: stringValue(item.image_info?.image_url ?? item.image_url),
      rawData: item as Prisma.InputJsonValue,
    })),
  };
}
