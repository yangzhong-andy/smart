import { Prisma } from "@prisma/client";

function text(value: unknown) { if (value === null || value === undefined) return null; const normalized = String(value).trim(); return normalized || null; }
function decimal(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? String(value) : null; }
function integer(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0; }
function date(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? new Date(parsed * 1000) : null; }
function price(raw: Record<string, any>) { const item = Array.isArray(raw.price_info) ? raw.price_info[0] : null; return { currency: text(item?.currency), originalPrice: decimal(item?.original_price), currentPrice: decimal(item?.current_price) }; }
function stock(raw: Record<string, any>) { const summary = raw.stock_info_v2?.summary_info; if (summary) return { availableStock: integer(summary.total_available_stock), reservedStock: integer(summary.total_reserved_stock) }; const rows = Array.isArray(raw.stock_info) ? raw.stock_info : []; return { availableStock: rows.reduce((sum: number, row: any) => sum + integer(row.current_stock ?? row.normal_stock), 0), reservedStock: rows.reduce((sum: number, row: any) => sum + integer(row.reserved_stock), 0) }; }
function dimension(raw: Record<string, any>) { return { weight: decimal(raw.weight), packageLength: decimal(raw.dimension?.package_length), packageWidth: decimal(raw.dimension?.package_width), packageHeight: decimal(raw.dimension?.package_height) }; }

export function normalizeShopeeProduct(base: Record<string, any>, extra: Record<string, any> | undefined, shop: { id: string; shopId: string; currency: string | null }) {
  const itemId = text(base.item_id); if (!itemId) throw new Error("Shopee product is missing item_id");
  const prices = price(base); const stocks = stock(base); const dimensions = dimension(base);
  return { itemId, data: { shopSettingId: shop.id, shopId: shop.shopId, itemName: text(base.item_name), itemSku: text(base.item_sku), itemStatus: text(base.item_status), categoryId: text(base.category_id), hasModel: Boolean(base.has_model), currency: prices.currency || shop.currency, originalPrice: prices.originalPrice, currentPrice: prices.currentPrice, ...stocks, sales: integer(extra?.sale), views: integer(extra?.views), likes: integer(extra?.likes), rating: decimal(extra?.rating_star), commentCount: integer(extra?.comment_count), ...dimensions, imageUrl: text(base.image?.image_url_list?.[0]), sourceCreateTime: date(base.create_time), sourceUpdateTime: date(base.update_time), rawData: { base, extra: extra || null } as Prisma.InputJsonValue, syncedAt: new Date() } };
}

export function normalizeShopeeProductModel(raw: Record<string, any>, shopCurrency: string | null) {
  const modelId = text(raw.model_id); if (!modelId) throw new Error("Shopee product model is missing model_id");
  const prices = price(raw); return { modelId, modelName: text(raw.model_name), modelSku: text(raw.model_sku), modelStatus: text(raw.model_status), currency: prices.currency || shopCurrency, originalPrice: prices.originalPrice, currentPrice: prices.currentPrice, ...stock(raw), ...dimension(raw), rawData: raw as Prisma.InputJsonValue };
}
