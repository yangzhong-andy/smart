import { businessDateUtcRange, isBusinessDate, relativeBusinessDate } from "./order-business-time";
import { isShopeeSalesOrder, isTikTokSalesOrder } from "./order-actual-units";
import { normalizeCommercePlatform } from "./platform-orders/contract";
import { normalizeCountryCode } from "./profit-schemes";
import type {
  PlatformProfitSkuCounts,
  PlatformProfitSkuFinancials,
  PlatformProfitSkuRow,
  PlatformProfitSkusResponse,
  ProfitSkuImageSource,
  ProfitSkuPlatform,
} from "./platform-profit-skus-types";

export type ProfitSkuFinancialMetric = PlatformProfitSkuFinancials & { shopId: string; sellerSku: string };

/** Attach exact profit-engine seller-SKU totals without duplicating shared financials across platform specifications. */
export function attachPlatformProfitSkuFinancials(
  response: PlatformProfitSkusResponse,
  input: { summary: PlatformProfitSkuFinancials; shops: Array<PlatformProfitSkuFinancials & { shopId: string }>; skus: ProfitSkuFinancialMetric[] },
) {
  response.summary.financial = input.summary;
  const shopFinancials = new Map(input.shops.map((row) => [row.shopId, row]));
  const skuFinancials = new Map(input.skus.map((row) => [JSON.stringify([row.shopId, skuKey(row.sellerSku)]), row]));
  for (const shop of response.shops) {
    const shopFinancial = shopFinancials.get(shop.shopId);
    if (shopFinancial) shop.financial = shopFinancial;
    const groups = new Map<string, PlatformProfitSkuRow[]>();
    for (const row of shop.skus) {
      const key = skuKey(row.sellerSku);
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    const groupUnits = new Map([...groups].map(([key, rows]) => [key, rows.reduce((sum, row) => sum + row.units, 0)]));
    shop.skus.sort((left, right) => {
      const leftKey = skuKey(left.sellerSku), rightKey = skuKey(right.sellerSku);
      return (groupUnits.get(rightKey) || 0) - (groupUnits.get(leftKey) || 0)
        || leftKey.localeCompare(rightKey) || right.units - left.units || left.id.localeCompare(right.id);
    });
    for (const [key, rows] of groups) {
      const financial = skuFinancials.get(JSON.stringify([shop.shopId, key])) || null;
      rows.forEach((row, index) => {
        row.financial = index === 0 ? financial : null;
        row.financialRowSpan = index === 0 ? rows.length : 0;
      });
    }
  }
  return response;
}

export type ProfitSkuFilters = Omit<PlatformProfitSkusResponse["filters"], "dateBasis">;
export type ProfitSkuShopSpec = {
  shopId: string;
  shopName: string;
  region: string;
  date: string;
  storageId: string;
};
export type ProfitSkuOrder = {
  shopId: string;
  orderId: string;
  status: string | null;
  rawData?: unknown;
  items?: ReadonlyArray<{
    itemId: string;
    modelId?: string | null;
    variationId?: string | null;
    modelSku?: string | null;
    itemSku?: string | null;
    sellerSku?: string | null;
    itemName?: string | null;
    modelName?: string | null;
    title?: string | null;
    imageUrl?: string | null;
    quantity: number;
    rawData?: unknown;
  }>;
};
export type ProfitSkuVariant = { id: string; skuId: string; productName?: string };
/** All product identities are platform-local and must also be scoped by shop. */
export type ProfitSkuProduct = {
  shopId: string;
  productId: string;
  imageUrl?: string | null;
  rawData?: unknown;
  skus?: ReadonlyArray<{ skuId: string; rawData?: unknown; pictureIds?: unknown }>;
};
export type ProfitSkuMapping = {
  shopId: string;
  sellerSku: string;
  components: ReadonlyArray<{ variantId: string; quantity: number }>;
};
export type ProfitSkuInventoryMapping = { tiktokShopId: string; sellerSku: string; variantId: string };

export function parseProfitSkuFilters(params: URLSearchParams): ProfitSkuFilters {
  const platform = normalizeCommercePlatform(params.get("platform"));
  if (!platform || platform === "AMAZON") throw new Error("请选择 TikTok、Shopee 或 Mercado Livre 平台");
  const relative = params.get("relativeDay");
  if (relative && relative !== "today" && relative !== "yesterday") throw new Error("相对日期参数无效");
  const date = params.get("date");
  const start = params.get("startDate");
  const end = params.get("endDate");
  const suppliedDates = [date, start, end].filter((value): value is string => value !== null);
  if (suppliedDates.some((value) => !isBusinessDate(value))) throw new Error("日期格式无效");
  if (relative && suppliedDates.length) throw new Error("相对日期与指定日期不能同时使用");
  if (!relative && (!suppliedDates.length || new Set(suppliedDates).size !== 1)) {
    throw new Error("SKU 明细仅支持查询一个指定日期");
  }
  return {
    platform,
    shopId: params.get("shopId")?.trim() || null,
    relativeDay: relative as ProfitSkuFilters["relativeDay"] || null,
    date: relative ? null : suppliedDates[0],
  };
}

export function profitSkuShopSpec(
  shop: { shopId: string; shopName: string | null; region: string; storageId?: string },
  filters: ProfitSkuFilters,
  now: Date,
): ProfitSkuShopSpec {
  const region = normalizeCountryCode(shop.region);
  const date = filters.relativeDay
    ? relativeBusinessDate(region, filters.relativeDay === "yesterday" ? -1 : 0, now)
    : filters.date!;
  return { shopId: shop.shopId, shopName: shop.shopName || shop.shopId, region, date, storageId: shop.storageId || shop.shopId };
}

export function profitSkuShopDateRange(shop: ProfitSkuShopSpec) {
  return businessDateUtcRange(shop.date, shop.date, shop.region);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function skuKey(value: unknown): string { return text(value).toLowerCase(); }
function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Only web images and image files in our local uploads directory may be linked. */
export function safeProfitSkuImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url || /[\s\\\u0000-\u001f\u007f]/.test(url)) return null;
  if (url.startsWith("/uploads/")) {
    // Keep encoded separators, traversal, and active HTML/SVG uploads out of links.
    return /^\/uploads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:avif|gif|jpe?g|png|webp|bmp|ico)$/i.test(url)
      && !url.split("/").some((part) => part === "." || part === "..") ? url : null;
  }
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.hostname && !parsed.username && !parsed.password
      ? parsed.href : null;
  } catch { return null; }
}

function firstImage(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const image = safeProfitSkuImageUrl(candidate);
    if (image) return image;
  }
  return null;
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function imageUrls(value: unknown): unknown[] {
  return array(value).flatMap((image) => typeof image === "string" ? [image] : [record(image).url, ...array(record(image).url_list)]);
}

// Mirrors isMercadoLivreProfitOrder without importing its external financial API dependencies.
export function isProfitSkuSalesOrder(platform: ProfitSkuPlatform, order: ProfitSkuOrder): boolean {
  if (platform === "TIKTOK") return isTikTokSalesOrder(order.status, order.rawData);
  if (platform === "SHOPEE") return isShopeeSalesOrder(order.status);
  return !["CANCELLED", "CANCELED", "UNPAID", "INVALID", "PAYMENT_REQUIRED", "PAYMENT_IN_PROCESS"]
    .includes(text(order.status).toUpperCase());
}

type ParsedLine = {
  sellerSku: string;
  platformSkuId: string | null;
  platformSkuKey: string | null;
  productName: string;
  productId: string | null;
  specificationId: string | null;
  imageUrl: string | null;
  units: number;
  missingLine: boolean;
};

function itemIdentity(itemId: string, specificationId: string | null | undefined) {
  return {
    platformSkuId: [itemId, specificationId].filter(Boolean).join(" / "),
    platformSkuKey: JSON.stringify([itemId, specificationId || ""]),
  };
}

function orderLines(platform: ProfitSkuPlatform, order: ProfitSkuOrder): ParsedLine[] {
  if (platform === "TIKTOK") {
    const raw = record(order.rawData);
    const lines = Array.isArray(raw.line_items) ? raw.line_items : [];
    if (!lines.length) return [{ sellerSku: "", platformSkuId: null, platformSkuKey: null, productName: "订单未提供商品明细", productId: null, specificationId: null, imageUrl: null, units: Math.max(number(raw.item_count), 1), missingLine: true }];
    return lines.map((value) => {
      const item = record(value);
      return {
        sellerSku: text(item.seller_sku),
        platformSkuId: text(item.sku_id || item.product_id) || null,
        platformSkuKey: text(item.sku_id || item.product_id) || null,
        productName: text(item.product_name),
        productId: text(item.product_id) || null,
        specificationId: text(item.sku_id) || null,
        imageUrl: firstImage(item.sku_image),
        units: Math.max(1, Math.round(number(item.quantity) || 1)),
        missingLine: false,
      };
    });
  }
  if (!order.items?.length) {
    // The existing Shopee/Mercado profit report counts the order but no units
    // when synchronized item rows are absent. Keep it visible without inventing units.
    return [{ sellerSku: "", platformSkuId: null, platformSkuKey: null, productName: "订单未提供商品明细", productId: null, specificationId: null, imageUrl: null, units: 0, missingLine: true }];
  }
  return order.items.map((item) => {
    if (platform === "SHOPEE") return {
      sellerSku: text(item.modelSku || item.itemSku),
      ...itemIdentity(item.itemId, item.modelId),
      productName: [item.itemName, item.modelName].filter(Boolean).join(" / "),
      productId: text(item.itemId) || null,
      specificationId: text(item.modelId) || null,
      imageUrl: firstImage(item.imageUrl, record(record(item.rawData).image_info).image_url, record(item.rawData).image_url),
      units: Math.max(0, item.quantity || 0),
      missingLine: false,
    };
    const raw = record(item.rawData);
    return {
      sellerSku: text(item.sellerSku || raw.seller_sku || raw.sellerSku || item.itemId),
      ...itemIdentity(item.itemId, item.variationId),
      productName: text(item.title),
      productId: text(item.itemId) || null,
      specificationId: text(item.variationId) || null,
      imageUrl: firstImage(raw.thumbnail, raw.picture_url, record(raw.item).thumbnail, record(raw.item).picture_url),
      units: Math.max(0, Math.trunc(number(item.quantity))),
      missingLine: false,
    };
  });
}

export function profitSkuProductReferences(platform: ProfitSkuPlatform, orders: ProfitSkuOrder[]) {
  const references = new Map<string, { shopId: string; productId: string }>();
  for (const order of orders) {
    if (!isProfitSkuSalesOrder(platform, order)) continue;
    for (const line of orderLines(platform, order)) {
      if (line.productId && !line.imageUrl) references.set(JSON.stringify([order.shopId, line.productId]), { shopId: order.shopId, productId: line.productId });
    }
  }
  return [...references.values()];
}

type LineImage = { imageUrl: string | null; imageSource: ProfitSkuImageSource | null };
const imagePriority = { order: 3, platform_sku: 2, platform_product: 1 };

function productImage(platform: ProfitSkuPlatform, line: ParsedLine, product: ProfitSkuProduct | undefined): LineImage {
  if (line.imageUrl) return { imageUrl: line.imageUrl, imageSource: "order" };
  if (!product) return { imageUrl: null, imageSource: null };
  const raw = record(product.rawData);
  let skuImage: string | null = null;
  let mainImage: string | null = null;
  if (platform === "TIKTOK") {
    // SKU IDs are never treated as product IDs, and a sibling SKU image is never borrowed.
    const sku = record(array(raw.skus).find((value) => line.specificationId && text(record(value).id || record(value).sku_id) === line.specificationId));
    const attributes = array(sku.sales_attributes).flatMap((value) => {
      const image = record(record(value).sku_img);
      return [image.url, ...array(image.url_list)];
    });
    skuImage = firstImage(sku.sku_image, record(sku.image).url, ...attributes);
    mainImage = firstImage(...imageUrls(raw.main_images), product.imageUrl);
  } else if (platform === "SHOPEE") {
    const sku = record(product.skus?.find((value) => value.skuId === line.specificationId)?.rawData);
    skuImage = firstImage(record(sku.image_info).image_url, sku.image_url, record(sku.image).image_url);
    mainImage = firstImage(product.imageUrl, ...array(record(record(raw.base).image).image_url_list));
  } else {
    const sku = product.skus?.find((value) => value.skuId === line.specificationId);
    const pictures = array(raw.pictures).map(record);
    const pictureIds = array(sku?.pictureIds ?? record(sku?.rawData).picture_ids);
    skuImage = firstImage(...pictureIds.flatMap((id) => {
      const picture = pictures.find((value) => text(value.id) === text(id));
      return [picture?.secure_url, picture?.url];
    }));
    mainImage = firstImage(raw.secure_thumbnail, product.imageUrl, raw.thumbnail);
  }
  if (skuImage) return { imageUrl: skuImage, imageSource: "platform_sku" };
  return { imageUrl: mainImage, imageSource: mainImage ? "platform_product" : null };
}

const emptyCounts = (): PlatformProfitSkuCounts => ({ orders: 0, units: 0, actualUnits: 0 });

export function aggregatePlatformProfitSkus(input: {
  filters: ProfitSkuFilters;
  shops: ProfitSkuShopSpec[];
  orders: ProfitSkuOrder[];
  variants: ProfitSkuVariant[];
  mappings: ProfitSkuMapping[];
  inventoryMappings?: ProfitSkuInventoryMapping[];
  products?: ProfitSkuProduct[];
  now: Date;
}): PlatformProfitSkusResponse {
  const { filters, shops, now } = input;
  const variantsById = new Map(input.variants.map((variant) => [variant.id, variant]));
  const variantsBySku = new Map(input.variants.map((variant) => [skuKey(variant.skuId), variant]));
  const mappingsBySku = new Map(input.mappings.map((mapping) => [JSON.stringify([mapping.shopId, skuKey(mapping.sellerSku)]), mapping.components]));
  const inventoryBySku = new Map((input.inventoryMappings || []).map((mapping) => [JSON.stringify([mapping.tiktokShopId, skuKey(mapping.sellerSku)]), mapping.variantId]));
  const productsById = new Map((input.products || []).map((product) => [JSON.stringify([product.shopId, product.productId]), product]));
  const totals = new Map(shops.map((shop) => [shop.shopId, {
    shop,
    counts: emptyCounts(),
    orderIds: new Set<string>(),
    skus: new Map<string, { row: PlatformProfitSkuRow; orderIds: Set<string> }>(),
  }]));
  let missingLineOrders = 0;
  let unknownSkuLines = 0;

  for (const order of input.orders) {
    const target = totals.get(order.shopId);
    if (!target || !isProfitSkuSalesOrder(filters.platform, order) || target.orderIds.has(order.orderId)) continue;
    target.orderIds.add(order.orderId);
    target.counts.orders += 1;
    const lines = orderLines(filters.platform, order);
    if (lines.some((line) => line.missingLine)) missingLineOrders += 1;
    for (const line of lines) {
      const key = skuKey(line.sellerSku);
      if (!key) unknownSkuLines += 1;
      const mappingKey = JSON.stringify([order.shopId, key]);
      const profitComponents = mappingsBySku.get(mappingKey);
      const inventoryVariant = variantsById.get(inventoryBySku.get(mappingKey) || "");
      const directVariant = variantsBySku.get(key);
      // Empty profit mappings fall back to inventory/direct on TikTok, while
      // Shopee/Mercado preserve the explicit mapping, matching their reports.
      const useProfit = filters.platform === "TIKTOK" ? Boolean(profitComponents?.length) : profitComponents !== undefined;
      const sourceComponents = useProfit
        ? profitComponents || []
        : filters.platform === "TIKTOK" && inventoryVariant
          ? [{ variantId: inventoryVariant.id, quantity: 1 }]
          : directVariant ? [{ variantId: directVariant.id, quantity: 1 }] : [];
      const resolved = sourceComponents.flatMap((component) => {
        const variant = variantsById.get(component.variantId);
        if (!variant && filters.platform === "TIKTOK") return [];
        return [{
          internalSku: variant?.skuId || component.variantId,
          quantityPerUnit: filters.platform === "MERCADO_LIVRE"
            ? Math.max(1, Math.trunc(number(component.quantity)) || 1)
            : Math.max(1, number(component.quantity)),
          productName: variant?.productName,
        }];
      });
      const mappingStatus: PlatformProfitSkuRow["mappingStatus"] = useProfit || (filters.platform === "TIKTOK" && inventoryVariant)
        ? "mapped" : directVariant ? "direct" : "unmapped";
      const factor = Math.max(1, resolved.reduce((sum, component) => sum + component.quantityPerUnit, 0));
      const rowId = JSON.stringify([order.shopId, key, line.platformSkuKey, line.missingLine]);
      const image = productImage(filters.platform, line, productsById.get(JSON.stringify([order.shopId, line.productId])));
      let entry = target.skus.get(rowId);
      if (!entry) {
        entry = {
          row: {
            id: rowId,
            sellerSku: line.sellerSku || "未提供 SKU",
            platformSkuId: line.platformSkuId,
            productName: line.productName || resolved[0]?.productName || line.sellerSku || "未知商品",
            ...image,
            mappingStatus,
            components: resolved.map(({ internalSku, quantityPerUnit }) => ({ internalSku, quantityPerUnit })),
            ...emptyCounts(),
          },
          orderIds: new Set(),
        };
        target.skus.set(rowId, entry);
      }
      // A later order may have the only valid SKU photo; do not lock in the
      // first missing image or a less-specific fallback when aggregating.
      if ((image.imageSource ? imagePriority[image.imageSource] : 0) > (entry.row.imageSource ? imagePriority[entry.row.imageSource] : 0)) {
        entry.row.imageUrl = image.imageUrl;
        entry.row.imageSource = image.imageSource;
      }
      entry.orderIds.add(order.orderId);
      entry.row.orders = entry.orderIds.size;
      entry.row.units += line.units;
      entry.row.actualUnits += line.units * factor;
      target.counts.units += line.units;
      target.counts.actualUnits += line.units * factor;
    }
  }
  const summary = emptyCounts();
  const results = [...totals.values()].map(({ shop, counts, skus }) => {
    summary.orders += counts.orders;
    summary.units += counts.units;
    summary.actualUnits += counts.actualUnits;
    return {
      shopId: shop.shopId, shopName: shop.shopName, region: shop.region, date: shop.date, ...counts,
      skus: [...skus.values()].map((entry) => entry.row).sort((a, b) => b.units - a.units || a.id.localeCompare(b.id)),
    };
  }).sort((a, b) => b.units - a.units || a.shopName.localeCompare(b.shopName));
  const warnings: string[] = [];
  if (missingLineOrders) warnings.push(`${missingLineOrders} 个订单缺少商品明细，已保留在列表，数量沿用现有利润汇总口径。`);
  if (unknownSkuLines) warnings.push(`${unknownSkuLines} 条商品明细没有店铺 SKU，已单独展示，未从统计中排除。`);
  return { filters: { ...filters, dateBasis: "DESTINATION_COUNTRY" }, summary, shops: results, warnings, generatedAt: now.toISOString() };
}
