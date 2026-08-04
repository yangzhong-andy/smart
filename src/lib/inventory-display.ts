/**
 * 库存查询页统一口径：数据来自 GET /api/products（at_factory / at_domestic / in_transit / at_overseas / cost_price）。
 * at_overseas 来自 Stock 表海外仓（Warehouse.type=OVERSEAS）汇总；总库存 = 工厂 + 国内 + 海运 + 海外仓。
 */

export type ProductInventoryFields = {
  at_factory?: number;
  at_domestic?: number;
  in_transit?: number;
  /** 海外仓在库件数（Stock × 海外仓） */
  at_overseas?: number;
  /** 数据库「总库存」字段，应与四分仓之和一致；不一致时在 UI 可提示核对 */
  stock_quantity?: number;
  cost_price?: number;
  currency?: string;
};

export function getExchangeRateToRmb(currency: string | undefined): number {
  const c = currency || "CNY";
  if (c === "USD") return 7.2;
  if (c === "HKD") return 0.92;
  if (c === "JPY") return 0.048;
  if (c === "EUR") return 7.8;
  if (c === "GBP") return 9.1;
  return 1;
}

export function unitCostRmb(product: ProductInventoryFields): number {
  const cost = Number(product.cost_price);
  const safe = Number.isFinite(cost) ? cost : 0;
  return safe * getExchangeRateToRmb(product.currency);
}

/**
 * 四分仓数量与总件数（总件数 = 四分仓之和；若分仓全为 0 但 stockQuantity>0，则仅总数字段有值，用于历史未拆仓数据）
 */
export function getInventoryBuckets(product: ProductInventoryFields) {
  const atF = Math.max(0, Math.trunc(Number(product.at_factory) || 0));
  const atD = Math.max(0, Math.trunc(Number(product.at_domestic) || 0));
  const tr = Math.max(0, Math.trunc(Number(product.in_transit) || 0));
  const atO = Math.max(0, Math.trunc(Number(product.at_overseas) || 0));
  const sumBuckets = atF + atD + tr + atO;
  const stockField = Math.max(0, Math.trunc(Number(product.stock_quantity) || 0));

  if (sumBuckets === 0 && stockField > 0) {
    return {
      atFactory: 0,
      atDomestic: 0,
      inTransit: 0,
      atOverseas: 0,
      totalQty: stockField,
      stockQuantityField: stockField,
      bucketsMismatch: true,
      unallocatedOnly: true as const,
    };
  }

  return {
    atFactory: atF,
    atDomestic: atD,
    inTransit: tr,
    atOverseas: atO,
    totalQty: sumBuckets,
    stockQuantityField: stockField,
    bucketsMismatch: stockField > 0 && stockField !== sumBuckets,
    unallocatedOnly: false as const,
  };
}

export type InventoryTotals = {
  totalValue: number;
  /** 各 SKU 总件数之和（与表格「总库存」列合计一致；含仅维护 stockQuantity 未拆仓的件数） */
  totalPieces: number;
  factoryQty: number;
  factoryValue: number;
  domesticQty: number;
  domesticValue: number;
  transitQty: number;
  transitValue: number;
  overseasQty: number;
  overseasValue: number;
};

/** 与表格行同一套公式汇总（含 cost_price 为 0 的 SKU） */
export function aggregateInventoryTotals(products: ProductInventoryFields[]): InventoryTotals {
  let totalValue = 0;
  let totalPieces = 0;
  let factoryQty = 0;
  let factoryValue = 0;
  let domesticQty = 0;
  let domesticValue = 0;
  let transitQty = 0;
  let transitValue = 0;
  let overseasQty = 0;
  let overseasValue = 0;

  for (const product of products) {
    const u = unitCostRmb(product);
    const b = getInventoryBuckets(product);
    const { atFactory, atDomestic, inTransit, atOverseas, totalQty } = b;

    totalPieces += totalQty;

    if (atFactory > 0) {
      factoryQty += atFactory;
      factoryValue += atFactory * u;
    }
    if (atDomestic > 0) {
      domesticQty += atDomestic;
      domesticValue += atDomestic * u;
    }
    if (inTransit > 0) {
      transitQty += inTransit;
      transitValue += inTransit * u;
    }
    if (atOverseas > 0) {
      overseasQty += atOverseas;
      overseasValue += atOverseas * u;
    }
    if (totalQty > 0) {
      totalValue += totalQty * u;
    }
  }

  return {
    totalValue,
    totalPieces,
    factoryQty,
    factoryValue,
    domesticQty,
    domesticValue,
    transitQty,
    transitValue,
    overseasQty,
    overseasValue,
  };
}
