export type TikTokOrderLine = {
  seller_sku?: unknown;
  quantity?: unknown;
};

/**
 * TikTok can represent multiple units in one line item. Always use quantity,
 * rather than the number of line-item rows, for inventory and order metrics.
 */
export function lineItemQuantity(item: TikTokOrderLine): number {
  const value = Number(item.quantity);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export function totalOrderQuantity(items: TikTokOrderLine[] | null | undefined): number {
  return (items || []).reduce((total, item) => total + lineItemQuantity(item), 0);
}

export function quantityBySellerSku(items: TikTokOrderLine[] | null | undefined): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of items || []) {
    const sellerSku = String(item.seller_sku || "").trim();
    if (!sellerSku) continue;
    quantities.set(sellerSku, (quantities.get(sellerSku) || 0) + lineItemQuantity(item));
  }
  return quantities;
}
