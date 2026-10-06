export const INVENTORY_ASSET_BUCKETS = [
  "FACTORY",
  "DOMESTIC",
  "SEA_TRANSIT",
  "OVERSEAS",
] as const;

export type InventoryAssetBucket = (typeof INVENTORY_ASSET_BUCKETS)[number];

export type InventoryAssetLot = {
  variantId: string;
  skuId: string;
  productName: string;
  imageUrl?: string | null;
  bucket: InventoryAssetBucket;
  quantity: number;
  unitCost?: number | null;
  currency?: string | null;
  sourceId: string;
  sourceLabel: string;
  sourceStatus?: string | null;
  issue?: string | null;
};

export type InventoryAssetMoney = Record<string, number>;

export type InventoryAssetBucketPosition = {
  quantity: number;
  values: InventoryAssetMoney;
  missingCostQuantity: number;
  sources: Array<{
    id: string;
    label: string;
    status?: string | null;
    quantity: number;
  }>;
};

export type InventoryAssetSkuPosition = {
  variantId: string;
  skuId: string;
  productName: string;
  imageUrl?: string | null;
  totalQuantity: number;
  totalValues: InventoryAssetMoney;
  missingCostQuantity: number;
  issues: string[];
  buckets: Record<InventoryAssetBucket, InventoryAssetBucketPosition>;
};

export type InventoryAssetSummaryBucket = {
  quantity: number;
  skuCount: number;
  values: InventoryAssetMoney;
  missingCostQuantity: number;
};

function emptyBucketPosition(): InventoryAssetBucketPosition {
  return { quantity: 0, values: {}, missingCostQuantity: 0, sources: [] };
}

function addMoney(target: InventoryAssetMoney, currency: string, amount: number) {
  target[currency] = (target[currency] || 0) + amount;
}

function roundMoneyMap(values: InventoryAssetMoney): InventoryAssetMoney {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => Math.abs(value) > 0.000001)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, value]) => [currency, Math.round(value * 100) / 100])
  );
}

export function aggregateInventoryAssetLots(lots: InventoryAssetLot[]) {
  const rows = new Map<string, InventoryAssetSkuPosition>();

  for (const lot of lots) {
    const quantity = Math.max(0, Math.trunc(Number(lot.quantity) || 0));
    if (!lot.variantId || quantity === 0) continue;

    const row = rows.get(lot.variantId) || {
      variantId: lot.variantId,
      skuId: lot.skuId,
      productName: lot.productName,
      imageUrl: lot.imageUrl,
      totalQuantity: 0,
      totalValues: {},
      missingCostQuantity: 0,
      issues: [],
      buckets: {
        FACTORY: emptyBucketPosition(),
        DOMESTIC: emptyBucketPosition(),
        SEA_TRANSIT: emptyBucketPosition(),
        OVERSEAS: emptyBucketPosition(),
      },
    } satisfies InventoryAssetSkuPosition;

    const bucket = row.buckets[lot.bucket];
    bucket.quantity += quantity;
    row.totalQuantity += quantity;
    bucket.sources.push({
      id: lot.sourceId,
      label: lot.sourceLabel,
      status: lot.sourceStatus,
      quantity,
    });

    const unitCost = Number(lot.unitCost);
    const currency = String(lot.currency || "").trim().toUpperCase();
    if (Number.isFinite(unitCost) && unitCost > 0 && currency) {
      addMoney(bucket.values, currency, quantity * unitCost);
      addMoney(row.totalValues, currency, quantity * unitCost);
    } else {
      bucket.missingCostQuantity += quantity;
      row.missingCostQuantity += quantity;
    }

    if (lot.issue && !row.issues.includes(lot.issue)) row.issues.push(lot.issue);
    rows.set(lot.variantId, row);
  }

  const result = [...rows.values()].map((row) => {
    row.totalValues = roundMoneyMap(row.totalValues);
    for (const bucket of INVENTORY_ASSET_BUCKETS) {
      row.buckets[bucket].values = roundMoneyMap(row.buckets[bucket].values);
      row.buckets[bucket].sources.sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label));
    }
    return row;
  });
  result.sort((a, b) => b.totalQuantity - a.totalQuantity || a.skuId.localeCompare(b.skuId));

  const summary = Object.fromEntries(
    INVENTORY_ASSET_BUCKETS.map((bucket) => {
      const bucketRows = result.filter((row) => row.buckets[bucket].quantity > 0);
      const values: InventoryAssetMoney = {};
      for (const row of bucketRows) {
        for (const [currency, value] of Object.entries(row.buckets[bucket].values)) {
          addMoney(values, currency, value);
        }
      }
      return [bucket, {
        quantity: bucketRows.reduce((sum, row) => sum + row.buckets[bucket].quantity, 0),
        skuCount: bucketRows.length,
        values: roundMoneyMap(values),
        missingCostQuantity: bucketRows.reduce((sum, row) => sum + row.buckets[bucket].missingCostQuantity, 0),
      } satisfies InventoryAssetSummaryBucket];
    }),
  ) as Record<InventoryAssetBucket, InventoryAssetSummaryBucket>;

  const totalValues: InventoryAssetMoney = {};
  for (const bucket of INVENTORY_ASSET_BUCKETS) {
    for (const [currency, value] of Object.entries(summary[bucket].values)) addMoney(totalValues, currency, value);
  }

  return {
    rows: result,
    summary,
    totals: {
      quantity: result.reduce((sum, row) => sum + row.totalQuantity, 0),
      skuCount: result.length,
      values: roundMoneyMap(totalValues),
      missingCostQuantity: result.reduce((sum, row) => sum + row.missingCostQuantity, 0),
      issueSkuCount: result.filter((row) => row.issues.length > 0).length,
    },
  };
}
