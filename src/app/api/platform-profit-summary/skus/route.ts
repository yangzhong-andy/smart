import { NextRequest, NextResponse } from "next/server";
import { GET as getTikTokProfitReport } from "@/app/api/profit-report/route";
import { GET as getShopeeProfitReport } from "@/app/api/shopee/profit/route";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  aggregatePlatformProfitSkus,
  attachPlatformProfitSkuFinancials,
  parseProfitSkuFilters,
  profitSkuShopDateRange,
  profitSkuShopSpec,
  profitSkuProductReferences,
  type ProfitSkuFilters,
  type ProfitSkuOrder,
  type ProfitSkuShopSpec,
  type ProfitSkuProduct,
  type ProfitSkuFinancialMetric,
} from "@/lib/platform-profit-skus";
import type { PlatformProfitSkuFinancials } from "@/lib/platform-profit-skus-types";

export const dynamic = "force-dynamic";

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function emptyFinancial(): PlatformProfitSkuFinancials { return { gmvCny: 0, profitCny: 0, margin: 0, originalGmv: {} }; }
function financialFromMetric(metric: any, shopee: boolean): PlatformProfitSkuFinancials {
  return {
    gmvCny: number(metric?.gmvCny),
    profitCny: number(shopee ? metric?.profitCny : metric?.contributionProfitCny),
    margin: number(metric?.margin),
    originalGmv: Object.fromEntries(Object.entries(metric?.originalAmounts?.gmv || {}).map(([currency, amount]) => [currency, number(amount)])),
  };
}
function mergeFinancial(target: PlatformProfitSkuFinancials, source: PlatformProfitSkuFinancials) {
  target.gmvCny = round(target.gmvCny + source.gmvCny);
  target.profitCny = round(target.profitCny + source.profitCny);
  for (const [currency, amount] of Object.entries(source.originalGmv)) target.originalGmv[currency] = round((target.originalGmv[currency] || 0) + amount);
  target.margin = target.gmvCny > 0 ? round(target.profitCny / target.gmvCny * 100) : 0;
}

function profitRequest(source: NextRequest, filters: ProfitSkuFilters, date: string, region: string, shopId?: string) {
  const url = new URL(source.url);
  url.pathname = filters.platform === "SHOPEE" ? "/api/shopee/profit" : "/api/profit-report";
  url.search = "";
  url.searchParams.set("startDate", date);
  url.searchParams.set("endDate", date);
  url.searchParams.set("groupBy", "day");
  url.searchParams.set("countryCode", region);
  if (shopId) url.searchParams.set("shopId", shopId);
  if (filters.platform !== "SHOPEE") url.searchParams.set("platform", filters.platform);
  const headers = new Headers();
  const cookie = source.headers.get("cookie"), authorization = source.headers.get("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest(url, { method: "GET", headers });
}

async function loadFinancials(source: NextRequest, filters: ProfitSkuFilters, shops: ProfitSkuShopSpec[]) {
  const summary = emptyFinancial();
  const shopMap = new Map<string, PlatformProfitSkuFinancials & { shopId: string }>();
  const skuMap = new Map<string, ProfitSkuFinancialMetric>();
  const groups = new Map<string, ProfitSkuShopSpec[]>();
  for (const shop of shops) {
    const key = `${shop.date}\u0000${shop.region}`;
    groups.set(key, [...(groups.get(key) || []), shop]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const request = profitRequest(source, filters, first.date, first.region, filters.shopId || undefined);
    const response = filters.platform === "SHOPEE" ? await getShopeeProfitReport(request) : await getTikTokProfitReport(request);
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || `${filters.platform} SKU 利润读取失败`);
    const isShopee = filters.platform === "SHOPEE";
    mergeFinancial(summary, financialFromMetric(body.summary, isShopee));
    for (const store of body.stores || []) {
      const shopId = String(store.shopId || "");
      if (!shopId) continue;
      const target = shopMap.get(shopId) || { shopId, ...emptyFinancial() };
      mergeFinancial(target, financialFromMetric(store, isShopee));
      shopMap.set(shopId, target);
    }
    for (const sku of body.skus || []) {
      const shopId = String(sku.shopId || ""), sellerSku = String(isShopee ? sku.sku : sku.sellerSku || "").trim();
      if (!shopId || !sellerSku) continue;
      const key = JSON.stringify([shopId, sellerSku.toLowerCase()]);
      const target = skuMap.get(key) || { shopId, sellerSku, ...emptyFinancial() };
      mergeFinancial(target, financialFromMetric(sku, isShopee));
      skuMap.set(key, target);
    }
  }
  return { summary, shops: [...shopMap.values()], skus: [...skuMap.values()] };
}

async function loadShops(filters: ProfitSkuFilters, now: Date): Promise<ProfitSkuShopSpec[]> {
  if (filters.platform === "TIKTOK") {
    const shops = await prisma.tikTokShopSetting.findMany({
      where: filters.shopId ? { shopId: filters.shopId } : undefined,
      select: { shopId: true, shopName: true, region: true },
    });
    return shops.map((shop) => profitSkuShopSpec(shop, filters, now));
  }
  if (filters.platform === "SHOPEE") {
    const shops = await prisma.shopeeShopSetting.findMany({
      where: { status: "active", ...(filters.shopId ? { shopId: filters.shopId } : {}) },
      select: { shopId: true, shopName: true, region: true },
    });
    return shops.map((shop) => profitSkuShopSpec(shop, filters, now));
  }
  const accounts = await prisma.mercadoLivreAccount.findMany({
    where: { status: "active", ...(filters.shopId ? { userId: filters.shopId } : {}) },
    select: { id: true, userId: true, nickname: true, country: true },
  });
  return accounts.map((account) => profitSkuShopSpec({
    shopId: account.userId, shopName: account.nickname, region: account.country, storageId: account.id,
  }, filters, now));
}

async function loadOrders(filters: ProfitSkuFilters, shops: ProfitSkuShopSpec[]): Promise<ProfitSkuOrder[]> {
  if (!shops.length) return [];
  if (filters.platform === "TIKTOK") {
    return prisma.tikTokOrder.findMany({
      where: { OR: shops.map((shop) => ({ shopId: shop.shopId, createTime: profitSkuShopDateRange(shop) })) },
      select: { shopId: true, orderId: true, status: true, rawData: true },
    });
  }
  if (filters.platform === "SHOPEE") {
    const orders = await prisma.shopeeOrder.findMany({
      where: { OR: shops.map((shop) => ({ shopId: shop.shopId, createTime: profitSkuShopDateRange(shop) })) },
      select: {
        shopId: true, orderSn: true, status: true,
        items: { select: { itemId: true, modelId: true, modelSku: true, itemSku: true, itemName: true, modelName: true, quantity: true, imageUrl: true, rawData: true } },
      },
    });
    return orders.map((order) => ({ ...order, orderId: order.orderSn }));
  }
  const shopIds = new Map(shops.map((shop) => [shop.storageId, shop.shopId]));
  const orders = await prisma.mercadoLivreOrder.findMany({
    where: { OR: shops.map((shop) => ({ accountId: shop.storageId, dateCreated: profitSkuShopDateRange(shop) })) },
    select: {
      accountId: true, externalOrderId: true, status: true,
      items: { select: { itemId: true, variationId: true, sellerSku: true, title: true, quantity: true, rawData: true } },
    },
  });
  return orders.map((order) => ({ ...order, shopId: shopIds.get(order.accountId)!, orderId: order.externalOrderId }));
}

async function loadProducts(filters: ProfitSkuFilters, shops: ProfitSkuShopSpec[], orders: ProfitSkuOrder[]): Promise<ProfitSkuProduct[]> {
  const references = profitSkuProductReferences(filters.platform, orders);
  if (!references.length) return [];
  const productsByShop = new Map<string, string[]>();
  for (const { shopId, productId } of references) {
    const ids = productsByShop.get(shopId) || [];
    ids.push(productId);
    productsByShop.set(shopId, ids);
  }
  const selected = [...productsByShop].map(([shopId, productIds]) => ({ shopId, productIds }));
  if (filters.platform === "TIKTOK") {
    const products = await prisma.tikTokProduct.findMany({
      where: { OR: selected.map(({ shopId, productIds }) => ({ shopId, productId: { in: productIds } })) },
      select: { shopId: true, productId: true, mainImage: true, rawData: true },
    });
    return products.map((product) => ({ ...product, imageUrl: product.mainImage }));
  }
  if (filters.platform === "SHOPEE") {
    const products = await prisma.shopeeProduct.findMany({
      where: { OR: selected.map(({ shopId, productIds }) => ({ shopId, itemId: { in: productIds } })) },
      select: { shopId: true, itemId: true, imageUrl: true, rawData: true, models: { select: { modelId: true, rawData: true } } },
    });
    return products.map((product) => ({ ...product, productId: product.itemId, skus: product.models.map((model) => ({ skuId: model.modelId, rawData: model.rawData })) }));
  }
  const accountIds = new Map(shops.map((shop) => [shop.shopId, shop.storageId]));
  const shopIds = new Map(shops.map((shop) => [shop.storageId, shop.shopId]));
  const products = await prisma.mercadoLivreProduct.findMany({
    where: { OR: selected.map(({ shopId, productIds }) => ({ accountId: accountIds.get(shopId)!, itemId: { in: productIds } })) },
    select: { accountId: true, itemId: true, thumbnail: true, rawData: true, variations: { select: { variationId: true, pictureIds: true, rawData: true } } },
  });
  return products.map((product) => ({
    shopId: shopIds.get(product.accountId)!, productId: product.itemId, imageUrl: product.thumbnail, rawData: product.rawData,
    skus: product.variations.map((variation) => ({ skuId: variation.variationId, pictureIds: variation.pictureIds, rawData: variation.rawData })),
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  let filters: ProfitSkuFilters;
  try {
    filters = parseProfitSkuFilters(request.nextUrl.searchParams);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "查询参数无效" }, { status: 400 });
  }
  try {
    const now = new Date();
    const shops = await loadShops(filters, now);
    if (filters.shopId && !shops.length) return NextResponse.json({ error: "所选平台没有该店铺" }, { status: 404 });
    const shopIds = shops.map((shop) => shop.shopId);
    // Quantity and images use synchronized orders/products only; financial values
    // are read separately from the existing profit engines without a sync or write.
    const [orders, variants, mappings, inventoryMappings] = await Promise.all([
      loadOrders(filters, shops),
      shops.length ? prisma.productVariant.findMany({ select: { id: true, skuId: true, product: { select: { name: true } } } }) : Promise.resolve([]),
      shops.length ? prisma.profitSkuMapping.findMany({
        where: { platform: filters.platform, shopId: { in: shopIds }, enabled: true },
        select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } },
      }) : Promise.resolve([]),
      filters.platform === "TIKTOK" && shops.length ? prisma.tikTokSkuMapping.findMany({
        where: { tiktokShopId: { in: shopIds } },
        select: { tiktokShopId: true, sellerSku: true, variantId: true },
      }) : Promise.resolve([]),
    ]);
    let products: ProfitSkuProduct[] = [];
    let productImagesUnavailable = false;
    try {
      products = await loadProducts(filters, shops, orders);
    } catch (error) {
      // Pictures are optional: an unavailable product cache must not hide order counts.
      productImagesUnavailable = true;
      console.error("[Platform Profit SKU Images]", error);
    }
    const result = aggregatePlatformProfitSkus({
      filters, shops, orders,
      variants: variants.map((variant) => ({ id: variant.id, skuId: variant.skuId, productName: variant.product.name })),
      mappings, inventoryMappings, products, now,
    });
    try {
      attachPlatformProfitSkuFinancials(result, await loadFinancials(request, filters, shops));
      result.warnings.push("SKU 的 GMV 与贡献利润直接来自平台精细利润核算；未能分摊到具体 SKU 的店铺级广告费等费用只计入店铺汇总，因此 SKU 利润相加可能与店铺总利润存在差异。");
    } catch (error) {
      console.error("[Platform Profit SKU Financials]", error);
      result.warnings.push("SKU 的 GMV 与贡献利润暂时无法读取，数量明细不受影响，可稍后刷新重试。");
    }
    if (productImagesUnavailable) result.warnings.push("部分商品图片暂时无法读取，SKU 数量明细不受影响，可稍后刷新明细重试。");
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Platform Profit SKU Details]", error);
    return NextResponse.json({ error: "SKU 数量明细加载失败，请稍后重试" }, { status: 500 });
  }
}
