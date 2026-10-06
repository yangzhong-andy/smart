import { Prisma } from "@prisma/client";

export const SHOPEE_RETURN_WINDOW_SECONDS = 15 * 24 * 60 * 60 - 1;

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function decimal(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(value) : null;
}

function date(value: unknown): Date | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return new Date(parsed > 10_000_000_000 ? parsed : parsed * 1000);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
}

export function splitShopeeReturnWindows(timeFrom: number, timeTo: number) {
  if (!Number.isInteger(timeFrom) || !Number.isInteger(timeTo) || timeFrom > timeTo) {
    throw new Error("Shopee return sync time range is invalid");
  }
  const windows: Array<{ timeFrom: number; timeTo: number }> = [];
  for (let cursor = timeFrom; cursor <= timeTo;) {
    const end = Math.min(timeTo, cursor + SHOPEE_RETURN_WINDOW_SECONDS);
    windows.push({ timeFrom: cursor, timeTo: end });
    cursor = end + 1;
  }
  return windows;
}

export function normalizeShopeeReturn(raw: Record<string, any>, shop: { id: string; shopId: string }) {
  const returnSn = text(raw.return_sn ?? raw.returnSn);
  if (!returnSn) throw new Error("Shopee return is missing return_sn");
  const rawItems = Array.isArray(raw.item) ? raw.item : Array.isArray(raw.item_list) ? raw.item_list : [];
  const disputeReasons = [
    ...stringArray(raw.dispute_reason),
    ...stringArray(raw.dispute_text_reason),
  ];

  return {
    returnSn,
    orderSn: text(raw.order_sn),
    data: {
      shopSettingId: shop.id,
      shopId: shop.shopId,
      status: text(raw.status),
      reason: text(raw.reason),
      textReason: text(raw.text_reason),
      refundAmount: decimal(raw.refund_amount),
      amountBeforeDiscount: decimal(raw.amount_before_discount),
      currency: text(raw.currency),
      trackingNumber: text(raw.tracking_number),
      needsLogistics: Boolean(raw.needs_logistics),
      dueDate: date(raw.due_date),
      returnShipDueDate: date(raw.return_ship_due_date),
      returnSellerDueDate: date(raw.return_seller_due_date),
      negotiationStatus: text(raw.negotiation_status),
      sellerProofStatus: text(raw.seller_proof_status),
      sellerCompensationStatus: text(raw.seller_compensation_status),
      buyerUsername: text(raw.user?.username),
      buyerEmail: text(raw.user?.email),
      images: stringArray(raw.image) as Prisma.InputJsonValue,
      disputeReasons: disputeReasons as Prisma.InputJsonValue,
      rawData: raw as Prisma.InputJsonValue,
      sourceCreateTime: date(raw.create_time),
      sourceUpdateTime: date(raw.update_time),
      syncedAt: new Date(),
    },
    items: rawItems.map((item: Record<string, any>, index: number) => ({
      itemId: text(item.item_id) || `line-${index + 1}`,
      modelId: text(item.model_id) || "0",
      itemSku: text(item.item_sku),
      modelSku: text(item.variation_sku ?? item.model_sku),
      itemName: text(item.name ?? item.item_name),
      quantity: Math.max(0, Math.trunc(Number(item.amount ?? item.quantity ?? 0) || 0)),
      itemPrice: decimal(item.item_price),
      images: stringArray(item.images) as Prisma.InputJsonValue,
      rawData: item as Prisma.InputJsonValue,
    })),
  };
}
