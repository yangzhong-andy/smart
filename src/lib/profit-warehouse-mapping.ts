export type ProfitWarehouseMapping = {
  tiktokWarehouseId: string;
  tiktokShopId?: string | null;
  warehouseId: string;
};

export type WarehouseResolutionStatus = "mapped" | "missing_id" | "unmapped" | "ambiguous";

export type WarehouseResolution = {
  tiktokWarehouseId: string | null;
  warehouseId: string | null;
  mapping: ProfitWarehouseMapping | null;
  status: WarehouseResolutionStatus;
};

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

/** Read the warehouse chosen by TikTok for this order, independent of shop. */
export function extractTikTokWarehouseId(rawData: unknown): string | null {
  if (!rawData || typeof rawData !== "object") return null;
  const raw = rawData as any;
  return firstText(
    raw.warehouse_id,
    raw.warehouseId,
    raw.fulfillment?.warehouse_id,
    raw.fulfillment?.warehouseId,
    raw.shipping?.warehouse_id,
    raw.shipping?.warehouseId,
    raw.package?.warehouse_id,
    raw.package?.warehouseId,
  );
}

export function createWarehouseResolver(mappings: ProfitWarehouseMapping[]) {
  const byTikTokId = new Map<string, ProfitWarehouseMapping[]>();
  for (const mapping of mappings) {
    const tiktokWarehouseId = String(mapping.tiktokWarehouseId ?? "").trim();
    const warehouseId = String(mapping.warehouseId ?? "").trim();
    if (!tiktokWarehouseId || !warehouseId) continue;
    const rows = byTikTokId.get(tiktokWarehouseId) || [];
    rows.push({ ...mapping, tiktokWarehouseId, warehouseId });
    byTikTokId.set(tiktokWarehouseId, rows);
  }

  return (rawData: unknown, shopId?: string | null): WarehouseResolution => {
    const tiktokWarehouseId = extractTikTokWarehouseId(rawData);
    if (!tiktokWarehouseId) {
      return { tiktokWarehouseId: null, warehouseId: null, mapping: null, status: "missing_id" };
    }

    const allRows = byTikTokId.get(tiktokWarehouseId) || [];
    // A TikTok warehouse id may be reused by different shops. Prefer the
    // shop-specific mapping, then fall back to a generic mapping.
    const shopRows = shopId ? allRows.filter((row) => row.tiktokShopId === shopId) : [];
    const genericRows = allRows.filter((row) => !row.tiktokShopId);
    const rows = shopRows.length > 0 ? shopRows : genericRows.length > 0 ? genericRows : allRows;
    const warehouseIds = new Set(rows.map((row) => row.warehouseId));
    if (warehouseIds.size > 1) {
      return { tiktokWarehouseId, warehouseId: null, mapping: null, status: "ambiguous" };
    }
    const mapping = rows[0] || null;
    return {
      tiktokWarehouseId,
      warehouseId: mapping?.warehouseId || null,
      mapping,
      status: mapping ? "mapped" : "unmapped",
    };
  };
}
