import type { SpuListItem } from "./products-store";
export type WorkspaceFilters = {
  keyword: string; status: string; category: string; supplier: string;
  sortBy: "name" | "cost" | "created" | "none"; sortOrder: "asc" | "desc";
  supplierProductIds?: Set<string> | null;
};
const contains = (value: unknown, keyword: string) => String(value ?? "").toLocaleLowerCase().includes(keyword);
export function productMatchesGroup(item: SpuListItem, keyword: string) {
  const key = keyword.trim().toLocaleLowerCase();
  return !key || [item.name, item.spuCode, item.category, ...(item.suppliers ?? []).map(s => s.name)].some(value => contains(value, key));
}
export function skuMatchesKeyword(item: { sku_id: string; color?: string | null; size?: string | null }, keyword: string) {
  const key = keyword.trim().toLocaleLowerCase();
  return !key || [item.sku_id, item.color, item.size].some(value => contains(value, key));
}
export function incompleteSku(item: NonNullable<SpuListItem["skuIndex"]>[number]) {
  return item.cost_price == null || !Number.isFinite(item.cost_price) ||
    [item.weight_kg, item.length, item.width, item.height].some(value => value == null || !Number.isFinite(value) || value <= 0);
}
export function filterProductWorkspace(items: SpuListItem[], filters: WorkspaceFilters) {
  const result = items.filter(item => {
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.supplier !== "all" && !item.suppliers?.some(s => s.id === filters.supplier)) return false;
    if (filters.supplierProductIds && !filters.supplierProductIds.has(item.productId)) return false;
    return productMatchesGroup(item, filters.keyword) || item.skuIndex?.some(s => skuMatchesKeyword(s, filters.keyword));
  });
  const dir = filters.sortOrder === "asc" ? 1 : -1;
  const cost = (item: SpuListItem) => {
    const rows = (item.skuIndex ?? []).filter(s => s.cost_price != null && Number.isFinite(s.cost_price));
    const currencies = new Set(rows.map(s => s.currency || "CNY"));
    return currencies.size === 1 ? { currency: rows[0].currency || "CNY", amount: Math.min(...rows.map(s => s.cost_price!)) } : null;
  };
  return result.sort((a, b) => {
    if (filters.sortBy === "cost") {
      const ac = cost(a), bc = cost(b);
      if (!ac || !bc) return ac ? -1 : bc ? 1 : a.name.localeCompare(b.name, "zh-CN");
      // Unlike currencies are grouped, never treated as directly comparable amounts.
      return ac.currency.localeCompare(bc.currency) || dir * (ac.amount - bc.amount) || a.name.localeCompare(b.name, "zh-CN");
    }
    if (filters.sortBy === "created") return dir * String(a.createdAt ?? "").localeCompare(b.createdAt ?? "") || a.name.localeCompare(b.name, "zh-CN");
    if (filters.sortBy === "name") return dir * a.name.localeCompare(b.name, "zh-CN");
    return String(b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.name.localeCompare(b.name, "zh-CN");
  });
}
