import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregatePlatformProfitSkus,
  attachPlatformProfitSkuFinancials,
  parseProfitSkuFilters,
  profitSkuShopDateRange,
  profitSkuShopSpec,
  profitSkuProductReferences,
  safeProfitSkuImageUrl,
  type ProfitSkuFilters,
  type ProfitSkuMapping,
  type ProfitSkuOrder,
  type ProfitSkuInventoryMapping,
  type ProfitSkuProduct,
} from "./platform-profit-skus";
import type { ProfitSkuPlatform } from "./platform-profit-skus-types";

const now = new Date("2026-09-18T01:00:00.000Z");
const filtersFor = (platform: ProfitSkuPlatform): ProfitSkuFilters => ({ platform, shopId: null, relativeDay: null, date: "2026-09-17" });
const variants = [
  { id: "set", skuId: "Set+3", productName: "Toilet Brush Set+3" },
  { id: "heads", skuId: "Heads-3", productName: "Brush Head 3 Packs" },
  { id: "direct", skuId: "DIRECT", productName: "Direct match" },
];

function summarize(platform: ProfitSkuPlatform, orders: ProfitSkuOrder[], mappings: ProfitSkuMapping[] = [], inventoryMappings: ProfitSkuInventoryMapping[] = [], products: ProfitSkuProduct[] = []) {
  const filters = filtersFor(platform);
  return aggregatePlatformProfitSkus({
    filters,
    shops: ["a", "b"].map((shopId) => profitSkuShopSpec({ shopId, shopName: `Shop ${shopId}`, region: "BR" }, filters, now)),
    orders, mappings, inventoryMappings, variants, products, now,
  });
}

test("SKU drilldown validates single dates and connected platforms", () => {
  assert.equal(parseProfitSkuFilters(new URLSearchParams("platform=tiktok&relativeDay=today")).relativeDay, "today");
  assert.equal(parseProfitSkuFilters(new URLSearchParams("platform=shopee&startDate=2026-09-17&endDate=2026-09-17")).date, "2026-09-17");
  for (const query of [
    "platform=all&date=2026-09-17", "platform=amazon&date=2026-09-17",
    "platform=tiktok&date=2026-02-30", "platform=shopee",
    "platform=shopee&startDate=2026-09-16&endDate=2026-09-17",
    "platform=tiktok&relativeDay=today&date=2026-09-17",
  ]) assert.throws(() => parseProfitSkuFilters(new URLSearchParams(query)));
});

test("profit-engine GMV and profit attach once across repeated seller-SKU specification rows", () => {
  const result = summarize("SHOPEE", [{ shopId: "a", orderId: "one", status: "COMPLETED", items: [
    { itemId: "100", modelId: "11", modelSku: "SET", quantity: 2 },
    { itemId: "100", modelId: "12", modelSku: "SET", quantity: 1 },
  ] }]);
  attachPlatformProfitSkuFinancials(result, {
    summary: { gmvCny: 260, profitCny: 52, margin: 20, originalGmv: { BRL: 200 } },
    shops: [{ shopId: "a", gmvCny: 260, profitCny: 52, margin: 20, originalGmv: { BRL: 200 } }],
    skus: [{ shopId: "a", sellerSku: "set", gmvCny: 260, profitCny: 52, margin: 20, originalGmv: { BRL: 200 } }],
  });
  assert.equal(result.summary.financial?.gmvCny, 260);
  assert.equal(result.shops[0].financial?.profitCny, 52);
  assert.equal(result.shops[0].skus.length, 2);
  assert.equal(result.shops[0].skus[0].financialRowSpan, 2);
  assert.equal(result.shops[0].skus[0].financial?.gmvCny, 260);
  assert.equal(result.shops[0].skus[1].financialRowSpan, 0);
  assert.equal(result.shops[0].skus[1].financial, null);
  assert.equal(result.shops[0].skus.filter((row) => row.financial).length, 1);
});

test("today uses each shop's business date and exclusive next-midnight boundary", () => {
  const filters = { ...filtersFor("TIKTOK"), relativeDay: "today" as const, date: null };
  const br = profitSkuShopSpec({ shopId: "br", shopName: "BR", region: "Brazil" }, filters, now);
  const jp = profitSkuShopSpec({ shopId: "jp", shopName: "JP", region: "JP" }, filters, now);
  assert.equal(br.date, "2026-09-17");
  assert.equal(jp.date, "2026-09-18");
  assert.equal(profitSkuShopDateRange(br).gte?.toISOString(), "2026-09-17T03:00:00.000Z");
  assert.equal(profitSkuShopDateRange(br).lt?.toISOString(), "2026-09-18T03:00:00.000Z");
  assert.equal(profitSkuShopDateRange(jp).gte?.toISOString(), "2026-09-17T15:00:00.000Z");
  const us = profitSkuShopSpec({ shopId: "us", shopName: "US", region: "US" }, { ...filtersFor("TIKTOK"), date: "2026-11-01" }, now);
  assert.equal(profitSkuShopDateRange(us).gte?.toISOString(), "2026-11-01T06:00:00.000Z");
  assert.equal(profitSkuShopDateRange(us).lt?.toISOString(), "2026-11-02T07:00:00.000Z");
});

test("TikTok quantities expand current compound mappings and count each order/SKU once", () => {
  const result = summarize("TIKTOK", [{
    shopId: "a", orderId: "one", status: "COMPLETED", rawData: { line_items: [
      { seller_sku: "BUNDLE", sku_id: "100", quantity: 2 },
      { seller_sku: "BUNDLE", sku_id: "100", quantity: 1 },
      { seller_sku: "DIRECT", sku_id: "200", quantity: 1 },
    ] },
  }, {
    shopId: "a", orderId: "two", status: "AWAITING_COLLECTION", rawData: { line_items: [{ seller_sku: "BUNDLE", sku_id: "100", quantity: 2 }] },
  }, {
    shopId: "b", orderId: "one", status: "COMPLETED", rawData: { line_items: [{ seller_sku: "BUNDLE", sku_id: "100", quantity: 1 }] },
  }], [{ shopId: "a", sellerSku: "bundle", components: [{ variantId: "set", quantity: 1 }, { variantId: "heads", quantity: 2 }] }]);
  assert.deepEqual(result.summary, { orders: 3, units: 7, actualUnits: 17 });
  const shop = result.shops.find((row) => row.shopId === "a")!;
  assert.deepEqual({ orders: shop.orders, units: shop.units, actualUnits: shop.actualUnits }, { orders: 2, units: 6, actualUnits: 16 });
  assert.equal(shop.skus.find((row) => row.sellerSku === "BUNDLE")?.orders, 2);
  assert.equal(shop.skus.find((row) => row.sellerSku === "DIRECT")?.mappingStatus, "direct");
  assert.equal(result.shops.find((row) => row.shopId === "b")?.skus[0].mappingStatus, "unmapped");
  assert.deepEqual(shop.skus[0].components, [{ internalSku: "Set+3", quantityPerUnit: 1 }, { internalSku: "Heads-3", quantityPerUnit: 2 }]);
});

test("TikTok excludes unpaid, cancelled and sample orders, including all their SKU quantities", () => {
  const orders: ProfitSkuOrder[] = [
    { shopId: "a", orderId: "paid", status: "COMPLETED", rawData: { line_items: [{ seller_sku: "DIRECT", quantity: 2 }] } },
    { shopId: "a", orderId: "sample", status: "COMPLETED", rawData: { is_sample_order: true, line_items: [{ quantity: 7 }] } },
    { shopId: "a", orderId: "cancel", status: "CANCELLED", rawData: { item_count: 10 } },
    { shopId: "a", orderId: "unpaid", status: "UNPAID", rawData: { item_count: 20 } },
  ];
  assert.deepEqual(summarize("TIKTOK", orders).summary, { orders: 1, units: 2, actualUnits: 2 });
});

test("TikTok profit mapping takes priority over inventory and direct mappings", () => {
  const order: ProfitSkuOrder = { shopId: "a", orderId: "one", status: "COMPLETED", rawData: { line_items: [{ seller_sku: "DIRECT", quantity: 3 }] } };
  const inventory = [{ tiktokShopId: "a", sellerSku: "DIRECT", variantId: "set" }];
  const compound = [{ shopId: "a", sellerSku: "DIRECT", components: [{ variantId: "heads", quantity: 2 }] }];
  assert.equal(summarize("TIKTOK", [order], compound, inventory).summary.actualUnits, 6);
  assert.equal(summarize("TIKTOK", [order], [], inventory).shops[0].skus[0].components[0].internalSku, "Set+3");
  assert.equal(summarize("TIKTOK", [order], [], []).shops[0].skus[0].components[0].internalSku, "DIRECT");
});

test("missing TikTok SKU/product data remains visible using the report fallback quantities", () => {
  const result = summarize("TIKTOK", [
    { shopId: "a", orderId: "one", status: "COMPLETED", rawData: { item_count: 4 } },
    { shopId: "a", orderId: "two", status: "COMPLETED", rawData: { line_items: [{ sku_id: "100", quantity: 2 }, { sku_id: "101" }] } },
  ]);
  assert.deepEqual(result.summary, { orders: 2, units: 7, actualUnits: 7 });
  assert.equal(result.shops[0].skus.length, 3);
  assert.equal(new Set(result.shops[0].skus.map((row) => row.id)).size, 3);
  assert.ok(result.shops[0].skus.every((row) => row.sellerSku === "未提供 SKU"));
  assert.equal(result.warnings.length, 2);
});

test("Shopee uses model SKU, skips excluded statuses and preserves zero-item orders", () => {
  const included: ProfitSkuOrder = { shopId: "a", orderId: "one", status: "READY_TO_SHIP", items: [
    { itemId: "100", modelId: "11", itemSku: "DIRECT", modelSku: "SET", quantity: 2 },
    { itemId: "100", modelId: "12", itemSku: "DIRECT", modelSku: "SET", quantity: 1 },
  ] };
  const result = summarize("SHOPEE", [included,
    { shopId: "a", orderId: "empty", status: "COMPLETED", items: [] },
    ...["CANCELLED", "CANCEL_REQUESTED", "UNPAID", "INCOMPLETE"].map((status) => ({ ...included, orderId: status, status })),
  ], [{ shopId: "a", sellerSku: "SET", components: [{ variantId: "set", quantity: 1 }, { variantId: "heads", quantity: 1 }] }]);
  assert.deepEqual(result.summary, { orders: 2, units: 3, actualUnits: 6 });
  assert.equal(result.shops[0].skus.length, 3);
  assert.equal(result.shops[0].skus.find((row) => row.sellerSku === "未提供 SKU")?.units, 0);
  assert.equal(result.shops[0].skus[0].platformSkuId, "100 / 11");
  assert.equal(new Set(result.shops[0].skus.map((row) => row.id)).size, 3);
});

test("Mercado Livre includes partially refunded orders and expands seller SKU mappings", () => {
  const included: ProfitSkuOrder = { shopId: "a", orderId: "one", status: "paid", items: [
    { itemId: "MLB100", variationId: "11", sellerSku: "", quantity: 2, rawData: { seller_sku: "BUNDLE" } },
    { itemId: "MLB200", quantity: 1 },
  ] };
  const result = summarize("MERCADO_LIVRE", [included,
    { shopId: "a", orderId: "refund", status: "partially_refunded", items: [{ itemId: "MLB300", sellerSku: "DIRECT", quantity: 1 }] },
    ...["cancelled", "canceled", "unpaid", "invalid", "payment_required", "payment_in_process"].map((status) => ({ ...included, orderId: status, status })),
  ], [{ shopId: "a", sellerSku: "BUNDLE", components: [{ variantId: "heads", quantity: 3 }] }]);
  assert.deepEqual(result.summary, { orders: 2, units: 4, actualUnits: 8 });
  assert.equal(result.shops[0].skus.find((row) => row.sellerSku === "BUNDLE")?.actualUnits, 6);
  assert.equal(result.shops[0].skus.find((row) => row.sellerSku === "BUNDLE")?.platformSkuId, "MLB100 / 11");
  assert.equal(result.shops[0].skus.find((row) => row.sellerSku === "MLB200")?.platformSkuId, "MLB200");
  assert.equal(result.shops[0].skus.find((row) => row.sellerSku === "MLB200")?.units, 1);
});

test("a repeated order cannot inflate shop or SKU quantities", () => {
  const order: ProfitSkuOrder = { shopId: "a", orderId: "one", status: "COMPLETED", rawData: { line_items: [{ seller_sku: "DIRECT", quantity: 3 }] } };
  assert.deepEqual(summarize("TIKTOK", [order, order]).summary, { orders: 1, units: 3, actualUnits: 3 });
});

test("readable platform SKU IDs cannot collide in aggregation keys", () => {
  for (const platform of ["SHOPEE", "MERCADO_LIVRE"] as const) {
    const result = summarize(platform, [{ shopId: "a", orderId: "one", status: "COMPLETED", items: [
      { itemId: "100 / 11", modelSku: "SET", sellerSku: "SET", quantity: 1 },
      { itemId: "100", modelId: "11", variationId: "11", modelSku: "SET", sellerSku: "SET", quantity: 2 },
    ] }]);
    assert.equal(result.shops[0].skus.length, 2);
    assert.ok(result.shops[0].skus.every((row) => row.platformSkuId === "100 / 11"));
    assert.equal(new Set(result.shops[0].skus.map((row) => row.id)).size, 2);
    assert.deepEqual(result.summary, { orders: 1, units: 3, actualUnits: 3 });
  }
});

test("image URLs allow web images and safe local uploads only", () => {
  for (const value of [null, undefined, "", "   ", {}, "javascript:alert(1)", "data:image/png;base64,a", "file:///tmp/a.png", "//evil.test/a.jpg", "https://", "https://user:password@example.com/a.jpg", "https://example.com/\nimage.png", "https:\\evil.test/a.jpg", "/uploads/../a.png", "/uploads/%2e%2e/a.png", "/uploads/a.svg", "/uploads/a.html", "/api/private"]) {
    assert.equal(safeProfitSkuImageUrl(value), null, String(value));
  }
  for (const value of ["https://example.com/a.jpg?size=small", "http://example.com/a.png", "/uploads/products/a-b_1.webp"]) {
    assert.equal(safeProfitSkuImageUrl(value), value);
  }
  assert.equal(safeProfitSkuImageUrl(" https://example.com/a.jpg "), "https://example.com/a.jpg");
});

test("empty and unsafe order images remain null without changing aggregation", () => {
  for (const platform of ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const) {
    const orders: ProfitSkuOrder[] = [{ shopId: "a", orderId: "one", status: "COMPLETED",
      rawData: { line_items: [{ seller_sku: "NO-MAP", sku_id: "100", quantity: 2, sku_image: "javascript:alert(1)" }] },
      items: [{ itemId: "100", sellerSku: "NO-MAP", modelSku: "NO-MAP", quantity: 2, imageUrl: "", rawData: { thumbnail: "data:image/png;base64,a" } }],
    }];
    const result = summarize(platform, orders);
    assert.deepEqual(result.summary, { orders: 1, units: 2, actualUnits: 2 });
    assert.equal(result.shops[0].skus[0].imageUrl, null);
    assert.equal(result.shops[0].skus[0].imageSource, null);
  }
});

test("TikTok later order image upgrades fallback and preserves every count", () => {
  const orders: ProfitSkuOrder[] = ["", "https://example.com/order.jpg"].map((sku_image, index) => ({
    shopId: "a", orderId: String(index), status: "COMPLETED", rawData: { line_items: [{ seller_sku: "DIRECT", product_id: "p", sku_id: "s", quantity: 2, sku_image }] },
  }));
  const products = [{ shopId: "a", productId: "p", imageUrl: "https://example.com/product.jpg" }];
  const result = summarize("TIKTOK", orders, [], [], products);
  assert.equal(result.shops[0].skus[0].imageUrl, "https://example.com/order.jpg");
  assert.equal(result.shops[0].skus[0].imageSource, "order");
  assert.deepEqual(result.summary, { orders: 2, units: 4, actualUnits: 4 });
  assert.equal(result.shops[0].skus[0].orders, 2);
  const reverse = summarize("TIKTOK", [...orders].reverse(), [], [], products);
  assert.deepEqual(reverse.shops, result.shops);
});

test("Shopee and Mercado use synchronized order item thumbnails", () => {
  const shopee = summarize("SHOPEE", [{ shopId: "a", orderId: "one", status: "COMPLETED", items: [
    { itemId: "100", modelId: "1", quantity: 1, imageUrl: "https://example.com/shopee.jpg" },
    { itemId: "100", modelId: "2", quantity: 1, imageUrl: "javascript:bad", rawData: { image_info: { image_url: "https://example.com/shopee-raw.jpg" } } },
  ] }]);
  assert.equal(shopee.shops[0].skus.find((row) => row.platformSkuId === "100 / 1")?.imageUrl, "https://example.com/shopee.jpg");
  assert.equal(shopee.shops[0].skus.find((row) => row.platformSkuId === "100 / 2")?.imageUrl, "https://example.com/shopee-raw.jpg");
  const mercado = summarize("MERCADO_LIVRE", [{ shopId: "a", orderId: "one", status: "paid", items: [
    { itemId: "MLB100", quantity: 1, rawData: { thumbnail: "invalid", item: { picture_url: "https://example.com/mercado.jpg" } } },
  ] }]);
  assert.equal(mercado.shops[0].skus[0].imageUrl, "https://example.com/mercado.jpg");
  assert.equal(mercado.shops[0].skus[0].imageSource, "order");
});

test("TikTok exact SKU image takes priority over labeled product fallback", () => {
  const orders: ProfitSkuOrder[] = [{ shopId: "a", orderId: "one", status: "COMPLETED", rawData: { line_items: [
    { seller_sku: "SAME", product_id: "p", sku_id: "wanted", quantity: 2 },
    { seller_sku: "SAME", product_id: "p", sku_id: "unknown", quantity: 1 },
    { seller_sku: "SAME", sku_id: "p", quantity: 1 },
  ] } }];
  const products = [{ shopId: "a", productId: "p", imageUrl: "https://example.com/product.jpg", rawData: { skus: [
    { id: "sibling", sku_image: "https://example.com/wrong.jpg" },
    { id: "wanted", sales_attributes: [{ sku_img: { url_list: ["https://example.com/wanted.jpg"] } }] },
  ] } }];
  const result = summarize("TIKTOK", orders, [], [], products);
  const rows = result.shops[0].skus;
  assert.equal(rows.find((row) => row.platformSkuId === "wanted")?.imageUrl, "https://example.com/wanted.jpg");
  assert.equal(rows.find((row) => row.platformSkuId === "wanted")?.imageSource, "platform_sku");
  assert.equal(rows.find((row) => row.platformSkuId === "unknown")?.imageSource, "platform_product");
  assert.equal(rows.find((row) => row.platformSkuId === "p")?.imageUrl, null, "SKU ID cannot stand in for missing product ID");
  assert.deepEqual(profitSkuProductReferences("TIKTOK", orders), [{ shopId: "a", productId: "p" }]);
});

test("platform products never cross shop or product boundaries despite shared seller SKUs", () => {
  for (const platform of ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const) {
    const orders: ProfitSkuOrder[] = ["a", "b"].map((shopId) => ({ shopId, orderId: "one", status: "COMPLETED",
      rawData: { line_items: [{ seller_sku: "SAME", product_id: "p", sku_id: "s", quantity: 1 }] },
      items: [{ itemId: "p", modelId: "s", variationId: "s", modelSku: "SAME", sellerSku: "SAME", quantity: 1 }],
    }));
    const products = [{ shopId: "a", productId: "p", imageUrl: "https://example.com/shop-a.jpg" }, { shopId: "b", productId: "other", imageUrl: "https://example.com/wrong-product.jpg" }];
    const result = summarize(platform, orders, [], [], products);
    assert.equal(result.shops.find((shop) => shop.shopId === "a")?.skus[0].imageUrl, "https://example.com/shop-a.jpg");
    assert.equal(result.shops.find((shop) => shop.shopId === "b")?.skus[0].imageUrl, null);
    assert.deepEqual(result.summary, { orders: 2, units: 2, actualUnits: 2 });
  }
});

test("Shopee model and Mercado variation images require exact specification identities", () => {
  for (const platform of ["SHOPEE", "MERCADO_LIVRE"] as const) {
    const orders: ProfitSkuOrder[] = [{ shopId: "a", orderId: "one", status: "COMPLETED", items: [
      { itemId: "p", modelId: "s", variationId: "s", quantity: 1 },
      { itemId: "p", modelId: "missing", variationId: "missing", quantity: 1 },
    ] }];
    const products: ProfitSkuProduct[] = [{ shopId: "a", productId: "p", imageUrl: "https://example.com/main.jpg",
      rawData: { pictures: [{ id: "sibling", secure_url: "https://example.com/wrong.jpg" }, { id: "right", secure_url: "https://example.com/right.jpg" }] },
      skus: [{ skuId: "s", rawData: { image_url: "https://example.com/right.jpg" }, pictureIds: ["right"] }, { skuId: "other", rawData: { image_url: "https://example.com/wrong.jpg" }, pictureIds: ["sibling"] }],
    }];
    const rows = summarize(platform, orders, [], [], products).shops[0].skus;
    assert.equal(rows.find((row) => row.platformSkuId === "p / s")?.imageUrl, "https://example.com/right.jpg");
    assert.equal(rows.find((row) => row.platformSkuId === "p / s")?.imageSource, "platform_sku");
    assert.equal(rows.find((row) => row.platformSkuId === "p / missing")?.imageUrl, "https://example.com/main.jpg");
    assert.equal(rows.find((row) => row.platformSkuId === "p / missing")?.imageSource, "platform_product");
  }
});

test("product image lookups skip orders that already have safe images and excluded orders", () => {
  for (const platform of ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const) {
    const order = (shopId: string, productId: string, imageUrl: string | null, status = "COMPLETED"): ProfitSkuOrder => ({
      shopId, orderId: `${shopId}-${productId}`, status,
      rawData: { line_items: [{ product_id: productId, sku_id: "s", seller_sku: "SAME", sku_image: imageUrl, quantity: 1 }] },
      items: [{ itemId: productId, modelId: "s", variationId: "s", quantity: 1, imageUrl, rawData: { thumbnail: imageUrl } }],
    });
    assert.deepEqual(profitSkuProductReferences(platform, [
      order("a", "ready", "https://example.com/ready.jpg"),
      order("a", "missing", null), order("a", "missing", null),
      order("b", "missing", "javascript:bad"),
      order("b", "excluded", null, "CANCELLED"),
    ]), [{ shopId: "a", productId: "missing" }, { shopId: "b", productId: "missing" }]);
  }
});
