import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductsTable } from "../app/product-center/products/components/ProductsTable";
import { ProductsStats } from "../app/product-center/products/components/ProductsStats";
import type { Product, SpuListItem } from "./products-store";
const group: SpuListItem = { productId: "p", name: "清洁刷", variantCount: 2, category: "清洁", status: "ACTIVE", skuIndex: [
  { sku_id: "Set-3", cost_price: null, currency: "CNY" },
  { sku_id: "Set-6", cost_price: 0, currency: "USD", size: "Set+6" },
]};
const rows: Product[] = group.skuIndex!.map(index => ({ sku_id: index.sku_id, variant_id: index.sku_id, product_id: "p", name: "清洁刷", cost_price: index.cost_price ?? 0, currency: index.currency as Product["currency"], size: index.size ?? "", stock_quantity: 15, main_image: "", status: "ACTIVE", createdAt: "", updatedAt: "" }));
const props = { filteredSpuList: [group], variantCache: { p: rows }, expandedSpuId: "p", setExpandedSpuId: () => {}, loadingSpuId: null, loadVariantsForSpu: async () => rows, onEditProduct: () => {}, onDeleteSku: () => {}, onDeleteSpu: () => {}, onOpenAddVariant: () => {}, onPreviewImages: () => {}, onCopySku: () => {} };
test("workspace defaults to cards with discoverable SKU actions and real currency", () => {
  const html = renderToStaticMarkup(createElement(ProductsTable, props));
  assert.match(html, /repeat\(auto-fill, minmax\(min\(100%, 300px\), 1fr\)\)/);
  assert.match(html, /data-card-layout="image-first"/);
  assert.match(html, /h-48 w-full/);
  assert.match(html, /from-blue-900 to-slate-900/);
  assert.match(html, /aria-pressed="true"[^>]*>.*?卡片视图/);
  assert.match(html, /新增 SKU/); assert.match(html, /复制 SKU/);
  assert.match(html, /data-card-sku-details="compact"/); assert.doesNotMatch(html, /<table/); assert.match(html, /Set-3/); assert.match(html, /Set-6/);
  assert.match(html, /待填写/); assert.match(html, /US\$0\.00/);
  assert.match(html, /档案库存/); assert.match(html, /箱规在/);
  assert.doesNotMatch(html, /<input/);
});
test("unopened image-first cards show costs grouped by actual currency without loading details", () => {
  const item: SpuListItem = { ...group, mainImage: "/brush.png", skuIndex: [
    { sku_id: "A", cost_price: 10, currency: "CNY" },
    { sku_id: "B", cost_price: 20, currency: "CNY" },
    { sku_id: "C", cost_price: 0, currency: "USD" },
    { sku_id: "D", cost_price: null, currency: "BRL" },
  ] };
  const html = renderToStaticMarkup(createElement(ProductsTable, { ...props, filteredSpuList: [item], variantCache: {}, expandedSpuId: null }));
  assert.match(html, /src="\/brush.png"/);
  assert.match(html, /object-contain p-2/);
  assert.match(html, /¥10\.00 ~ ¥20\.00/);
  assert.match(html, /US\$0\.00/);
  assert.doesNotMatch(html, /R\$/);
  assert.match(html, /新增 SKU/); assert.match(html, /查看 SKU/);
  assert.doesNotMatch(html, /md:col-span|xl:col-span/);
});
test("search matches unloaded-index SKU but only displays relevant detail rows", () => {
  const html = renderToStaticMarkup(createElement(ProductsTable, { ...props, searchKeyword: "Set+6" }));
  assert.match(html, /Set-6/); assert.doesNotMatch(html, /Set-3/);
});
test("detail error is not represented as a missing product or zero SKUs", () => {
  const html = renderToStaticMarkup(createElement(ProductsTable, { ...props, variantCache: {}, variantErrors: { p: "网络故障" } }));
  assert.match(html, /role="alert"/); assert.match(html, /重新加载/);
  assert.doesNotMatch(html, /此产品还没有 SKU/);
});
test("compact stats separate product and SKU counts without a mixed-currency average", () => {
  const html = renderToStaticMarkup(createElement(ProductsStats, { summary: { totalCount: 1, skuCount: 2, onSaleCount: 1, offSaleCount: 0, incompleteCount: 2, avgCost: 0 } }));
  assert.match(html, /产品系列/); assert.match(html, /SKU 规格/);
  assert.match(html, /待完善 SKU/); assert.doesNotMatch(html, /平均成本/);
});
