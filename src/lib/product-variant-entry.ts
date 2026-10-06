import type { Product } from "./products-store";
import { newVariantRow, type VariantRow } from "../app/product-center/products/components/types";

export const VARIANT_CURRENCIES = ["CNY", "USD", "HKD", "JPY", "GBP", "EUR"] as const;
export const VARIANT_SPEC_SUGGESTIONS = ["Set+3", "Set+6", "Brush-Head-3Packs", "单件", "标准款", "S", "M", "L", "XL"];
export const VARIANT_PASTE_COLUMNS = ["sku_id", "size", "color", "cost_price", "currency", "weight_kg", "length", "width", "height", "barcode"] as const;

const optionalNumbers = ["weight_kg", "length", "width", "height", "volumetric_divisor", "target_roi"] as const;
const entryFields = ["color", "size", "cost_price", "currency", ...optionalNumbers] as const;
export type VariantRowErrors = Record<string, Record<string, string>>;
export type VariantEntryPayload = Pick<Product, "sku_id" | "cost_price"> & Partial<Pick<Product, "color" | "size" | "barcode" | "currency" | typeof optionalNumbers[number]>>;

export function isVariantRowEmpty(row: VariantRow): boolean {
  return ["sku_id", "barcode", ...entryFields].every((field) => !String(row[field as keyof VariantRow] ?? "").trim());
}

export function validateVariantRows(rows: VariantRow[], existingSkuIds: string[] = []): { valid: boolean; errors: VariantRowErrors } {
  const errors: VariantRowErrors = {};
  const existing = new Set(existingSkuIds.map((sku) => sku.trim()));
  const skuCounts = new Map<string, number>();
  for (const row of rows) {
    const sku = row.sku_id.trim();
    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
  }
  for (const row of rows) {
    const rowErrors: Record<string, string> = {};
    const sku = row.sku_id.trim();
    if (!sku) rowErrors.sku_id = "请填写 SKU 编码";
    else if ((skuCounts.get(sku) ?? 0) > 1) rowErrors.sku_id = "本批次 SKU 编码重复";
    else if (existing.has(sku)) rowErrors.sku_id = "此 SKU 编码已存在";
    if (!row.cost_price.trim()) rowErrors.cost_price = "请填写成本价，零成本请明确填 0";
    else if (!Number.isFinite(Number(row.cost_price)) || Number(row.cost_price) < 0) rowErrors.cost_price = "成本价必须是大于或等于 0 的有效数字";
    if (row.currency?.trim() && !VARIANT_CURRENCIES.includes(row.currency.trim() as typeof VARIANT_CURRENCIES[number])) rowErrors.currency = "请选择支持的币种";
    for (const field of optionalNumbers) {
      const value = row[field]?.trim();
      const positive = field === "length" || field === "width" || field === "height" || field === "volumetric_divisor";
      if (value && (!Number.isFinite(Number(value)) || Number(value) < 0 || (positive && Number(value) === 0) || (field === "volumetric_divisor" && !Number.isInteger(Number(value))))) {
        rowErrors[field] = field === "volumetric_divisor" ? "换算系数必须为正整数" : positive ? "尺寸必须大于 0" : "请填写大于或等于 0 的有效数字";
      }
    }
    if (Object.keys(rowErrors).length > 0) errors[row.tempId] = rowErrors;
  }
  return { valid: rows.length > 0 && Object.keys(errors).length === 0, errors };
}

/** Only entry fields are allowed into a create payload; never IDs, mappings or inventory. */
export function serializeVariantRows(rows: VariantRow[]): VariantEntryPayload[] {
  if (!validateVariantRows(rows).valid) throw new Error("请先修正 SKU 表格中的错误");
  return rows.map((row) => {
    const payload: VariantEntryPayload = { sku_id: row.sku_id.trim(), cost_price: Number(row.cost_price) };
    for (const field of ["color", "size", "barcode"] as const) {
      if (row[field].trim()) payload[field] = row[field].trim();
    }
    if (row.currency?.trim()) payload.currency = row.currency.trim() as Product["currency"];
    for (const field of optionalNumbers) {
      if (row[field]?.trim()) payload[field] = Number(row[field]);
    }
    return payload;
  });
}

export function copyVariantRow(row: VariantRow): VariantRow {
  const copy = newVariantRow();
  for (const field of entryFields) copy[field] = row[field] ?? "";
  copy.copiedFromSku = row.sku_id.trim() || row.copiedFromSku;
  return copy;
}

export function variantRowFromProduct(product: Product): VariantRow {
  const row = newVariantRow();
  for (const field of entryFields) row[field] = product[field] == null ? "" : String(product[field]);
  row.copiedFromSku = product.sku_id;
  return row;
}

/** Pasted text must have no header. Extra cells/blank interior lines are reported, not discarded. */
export function parseVariantRowsFromTsv(text: string): { rows: VariantRow[]; issues: { line: number; message: string }[] } {
  if (!text.trim()) return { rows: [], issues: [{ line: 1, message: "请先粘贴数据" }] };
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  // A final newline is a spreadsheet clipboard terminator, not an additional row.
  if (lines.at(-1) === "") lines.pop();
  const issues: { line: number; message: string }[] = [];
  const rows = lines.map((line, index) => {
    const cells = line.split("\t");
    if (cells.length < 4) issues.push({ line: index + 1, message: "至少需要前 4 列：SKU、规格、颜色、成本价；空列也请保留制表符" });
    if (cells.length > VARIANT_PASTE_COLUMNS.length) issues.push({ line: index + 1, message: `发现 ${cells.length} 列，最多支持 ${VARIANT_PASTE_COLUMNS.length} 列；请检查多余列或换行` });
    const row = newVariantRow();
    VARIANT_PASTE_COLUMNS.forEach((field, column) => { row[field] = cells[column]?.trim() ?? ""; });
    return row;
  });
  return { rows, issues };
}
