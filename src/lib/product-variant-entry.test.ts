import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Product } from "./products-store";
import { newVariantRow, type ProductFormState } from "../app/product-center/products/components/types";
import { AddVariantDialog } from "../app/product-center/products/components/AddVariantDialog";
import { ProductFormDialog } from "../app/product-center/products/components/ProductFormDialog";
import { copyVariantRow, isVariantRowEmpty, parseVariantRowsFromTsv, serializeVariantRows, validateVariantRows, variantRowFromProduct } from "./product-variant-entry";

const row = (overrides: Partial<ReturnType<typeof newVariantRow>> = {}) => ({ ...newVariantRow(), sku_id: "Brush-Set3", cost_price: "12.5", size: "Set+3", ...overrides });

test("newVariantRow works on insecure HTTP where crypto exists without randomUUID", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
    const first = newVariantRow();
    const second = newVariantRow();
    assert.match(first.tempId, /^tmp-/);
    assert.notEqual(first.tempId, second.tempId);
    assert.equal(first.currency, "");
    assert.equal(first.cost_price, "");
  } finally {
    if (original) Object.defineProperty(globalThis, "crypto", original);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("cost is required explicitly, including on incomplete rows, while explicit zero is valid", () => {
  const blank = newVariantRow();
  assert.equal(isVariantRowEmpty(blank), true);
  assert.equal(validateVariantRows([]).valid, false);
  assert.equal(validateVariantRows([blank]).valid, false);
  assert.ok(validateVariantRows([blank]).errors[blank.tempId].sku_id);
  assert.ok(validateVariantRows([blank]).errors[blank.tempId].cost_price);
  for (const cost of ["", " ", "-1", "NaN", "Infinity", "abc"]) assert.equal(validateVariantRows([row({ cost_price: cost })]).valid, false);
  assert.equal(validateVariantRows([row({ cost_price: "0", color: "", size: "Brush-Head-3Packs" })]).valid, true);
  assert.equal(validateVariantRows([row({ sku_id: "", size: "Set+6" })]).valid, false);
});

test("duplicate trimmed SKU errors identify both rows and existing products", () => {
  const rows = [row(), row({ sku_id: " Brush-Set3 " })];
  const result = validateVariantRows(rows);
  assert.equal(result.valid, false);
  assert.ok(result.errors[rows[0].tempId].sku_id);
  assert.ok(result.errors[rows[1].tempId].sku_id);
  assert.equal(validateVariantRows([row()], [" Brush-Set3 "]).valid, false);
  assert.equal(validateVariantRows([row()], ["brush-set3"]).valid, true);
});

test("physical fields reject negative and invalid values; dimensions must be positive", () => {
  for (const field of ["weight_kg", "length", "width", "height", "volumetric_divisor", "target_roi"] as const) {
    assert.equal(validateVariantRows([row({ [field]: "-1" })]).valid, false);
    assert.equal(validateVariantRows([row({ [field]: "invalid" })]).valid, false);
  }
  for (const field of ["length", "width", "height", "volumetric_divisor"] as const) assert.equal(validateVariantRows([row({ [field]: "0" })]).valid, false);
  assert.equal(validateVariantRows([row({ volumetric_divisor: "5000.5" })]).valid, false);
  assert.equal(validateVariantRows([row({ weight_kg: "0", target_roi: "0" })]).valid, true);
});

test("copying a row creates a new identity and preserves only safe editable values", () => {
  const original = { ...row({ currency: "CNY", weight_kg: "0.5", length: "20", barcode: "12345" }), product_id: "spu", variant_id: "id", stock_quantity: 95, platform_sku_mapping: [{ platformSkuId: "x" }] };
  const copy = copyVariantRow(original);
  assert.notEqual(copy.tempId, original.tempId);
  assert.equal(copy.sku_id, ""); assert.equal(copy.barcode, "");
  assert.equal(copy.size, "Set+3"); assert.equal(copy.cost_price, "12.5");
  assert.equal(copy.weight_kg, "0.5"); assert.equal(copy.currency, "CNY");
  assert.equal(copy.copiedFromSku, "Brush-Set3");
  assert.equal("stock_quantity" in copy, false); assert.equal("variant_id" in copy, false);
  assert.equal("product_id" in copy, false); assert.equal("platform_sku_mapping" in copy, false);
});

test("copy from a product preserves zero and physical values without copying identifiers or stock", () => {
  const product: Product = { sku_id: "OLD-SKU", name: "Brush", main_image: "https://example.com/image.png", cost_price: 0, status: "ACTIVE", currency: "USD", size: "Brush-Head-3Packs", weight_kg: 0, width: 12, barcode: "abc", stock_quantity: 500, at_factory: 20, product_id: "spu", variant_id: "variant", createdAt: "", updatedAt: "" };
  const copy = variantRowFromProduct(product);
  assert.equal(copy.sku_id, ""); assert.equal(copy.barcode, "");
  assert.equal(copy.cost_price, "0"); assert.equal(copy.weight_kg, "0"); assert.equal(copy.width, "12");
  assert.equal(copy.copiedFromSku, "OLD-SKU");
  for (const key of ["product_id", "variant_id", "stock_quantity", "at_factory", "main_image", "createdAt"]) assert.equal(key in copy, false);
});

test("serialization is whitelisted, numeric, trimmed and never silently converts a blank cost into zero", () => {
  const source = { ...row({ sku_id: " New-SKU ", cost_price: "0", currency: "USD", weight_kg: "0", length: "12.3", width: "", size: " Set+6 ", barcode: " abc " }), stock_quantity: 100, at_domestic: 70, variant_id: "original", product_id: "parent", inventory: [{ qty: 1 }] };
  assert.deepEqual(serializeVariantRows([source]), [{ sku_id: "New-SKU", cost_price: 0, size: "Set+6", barcode: "abc", currency: "USD", weight_kg: 0, length: 12.3 }]);
  assert.throws(() => serializeVariantRows([row({ cost_price: "" })]), /SKU/);
  assert.throws(() => serializeVariantRows([row(), newVariantRow()]), /SKU/);
});

test("TSV parser preserves empty columns, arbitrary specs, numbers and multiline previews", () => {
  const parsed = parseVariantRowsFromTsv("Brush-A\tSet+3\t\t0\tCNY\t0.4\t12\t10\t5\tbarcode-a\r\nBrush-B\tBrush-Head-3Packs\t蓝色\t20\r\n");
  assert.deepEqual(parsed.issues, []); assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].color, ""); assert.equal(parsed.rows[0].cost_price, "0");
  assert.equal(parsed.rows[0].barcode, "barcode-a"); assert.equal(parsed.rows[1].size, "Brush-Head-3Packs");
  assert.equal(validateVariantRows(parsed.rows).valid, true);
});

test("TSV preview exposes extra columns, missing required values and blank interior lines without discarding rows", () => {
  const extra = parseVariantRowsFromTsv("a\tb\tc\t2\tUSD\t1\t2\t3\t4\tx\tunmapped");
  assert.equal(extra.rows.length, 1); assert.equal(extra.issues[0].line, 1);
  const broken = parseVariantRowsFromTsv("a\tSet+3\t\t\n\nb\tSet+6\t\t0");
  assert.equal(broken.rows.length, 3); assert.equal(broken.issues[0].line, 2);
  assert.equal(validateVariantRows(broken.rows).valid, false);
  assert.equal(parseVariantRowsFromTsv("").issues.length, 1);
});

test("add-SKU dialog renders free-text inputs, explicit defaults and disabled submitting controls", () => {
  const html = renderToStaticMarkup(createElement(AddVariantDialog, {
    spu: { productId: "spu-id", name: "清洁刷", variantCount: 3 }, variants: [row()],
    onVariantsChange: () => {}, onClose: () => {}, onSubmit: () => {}, isSubmitting: true,
  }));
  assert.match(html, /max-w-7xl/);
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /新增默认人民币/);
  assert.match(html, /空白物流资料待补/);
  assert.match(html, /默认 CNY/);
  assert.doesNotMatch(html, /空白物流资料继承产品默认值/);
  assert.match(html, /<input[^>]+aria-label="第 1 行规格"[^>]+list=/);
  assert.match(html, /<input[^>]+aria-label="第 1 行颜色"[^>]+list=/);
  assert.match(html, /Brush-Head-3Packs/);
  assert.match(html, /<button[^>]+aria-label="关闭添加 SKU"[^>]+disabled=/);
  const enabledButtons = (html.match(/<button\b[^>]*>/g) ?? []).filter((tag) => !tag.includes("disabled="));
  assert.equal(enabledButtons.length, 0);
});

test("product form keeps shared defaults, supplier features and an accurate editing scope", () => {
  const form: ProductFormState = {
    spu_code: "SPU-1", sku_id: "SKU-1", name: "清洁刷", main_image: "", gallery_images: [], category: "", brand: "", description: "", material: "",
    customs_name_cn: "", customs_name_en: "", default_supplier_id: "", status: "ACTIVE", cost_price: "0", target_roi: "", currency: "CNY", weight_kg: "",
    length: "", width: "", height: "", volumetric_divisor: "5000", color: "", size: "Set+6", barcode: "", stock_quantity: "0", factory_id: "", moq: "", lead_time: "", suppliers: [],
  };
  const props = { open: true, onClose: () => {}, form, setForm: () => {}, formVariants: [row()], setFormVariants: () => {}, onSubmit: () => {}, isSubmitting: false, suppliers: [] };
  const createHtml = renderToStaticMarkup(createElement(ProductFormDialog, { ...props, editingProduct: null }));
  assert.match(createHtml, /公共物流默认值/);
  assert.match(createHtml, /成本价以上方各 SKU 行为准/);
  assert.doesNotMatch(createHtml, /参考拿货价/);
  assert.match(createHtml, /添加供应商/);
  const product: Product = { sku_id: "SKU-1", name: "清洁刷", main_image: "", status: "ACTIVE", cost_price: 0, currency: "CNY", createdAt: "", updatedAt: "" };
  const editHtml = renderToStaticMarkup(createElement(ProductFormDialog, { ...props, editingProduct: product }));
  assert.match(editHtml, /编辑SKU与产品资料/);
  assert.match(editHtml, /全部 SKU/);
  assert.match(editHtml, /<input[^>]+list=[^>]+value="Set\+6"/);
  assert.match(editHtml, /参考拿货价/);
  assert.match(editHtml, /已有 SKU 编码不可在此修改；新增规格请复制 SKU/);
  const skuInputs = (editHtml.match(/<input\b[^>]*>/g) ?? []).filter((tag) => tag.includes('value="SKU-1"'));
  assert.equal(skuInputs.length, 2);
  assert.ok(skuInputs.every((tag) => /readonly=""/i.test(tag)), "every existing SKU code input must be read-only");
});
