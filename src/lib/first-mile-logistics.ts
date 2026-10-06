type FirstMileBatchItem = {
  variantId: string | null;
  sku: string | null;
  qty: number;
  variant: { lengthCm: unknown; widthCm: unknown; heightCm: unknown } | null;
};

export type FirstMileLogisticsCost = {
  amount: unknown;
  currency: string | null;
  costType: string;
  containerId: string | null;
  outboundBatch: {
    containerId: string | null;
    container: { id: string } | null;
    outboundBatchItems: FirstMileBatchItem[];
  } | null;
};

export type FirstMileUnitCost = {
  cny: number;
  originalByCurrency: Record<string, number>;
};

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateFirstMileUnitCosts(
  costs: FirstMileLogisticsCost[],
  toCny: (amount: unknown, currency: string | null) => number,
) {
  type AllocationItem = {
    variantId: string | null;
    sku: string;
    qty: number;
    length: number;
    width: number;
    height: number;
  };
  type AllocationGroup = {
    totalCostCny: number;
    totalCostOriginalByCurrency: Record<string, number>;
    items: Map<string, AllocationItem>;
  };
  type CostTotal = { costCny: number; qty: number; originalByCurrency: Record<string, number> };

  const groups = new Map<string, AllocationGroup>();
  for (const cost of costs) {
    const batch = cost.outboundBatch;
    const containerId = cost.containerId || batch?.containerId || batch?.container?.id;
    if (!batch || !containerId) continue;
    const key = `${containerId}\u0000${cost.costType}`;
    const group = groups.get(key) || {
      totalCostCny: 0,
      totalCostOriginalByCurrency: {},
      items: new Map<string, AllocationItem>(),
    };
    group.totalCostCny += toCny(cost.amount, cost.currency);
    const currency = String(cost.currency || "CNY").trim().toUpperCase();
    group.totalCostOriginalByCurrency[currency] = (group.totalCostOriginalByCurrency[currency] || 0) + numeric(cost.amount);
    for (const item of batch.outboundBatchItems) {
      if (item.qty <= 0) continue;
      const sku = String(item.sku || "").trim();
      const itemKey = sku || item.variantId || "unknown";
      const current = group.items.get(itemKey) || {
        variantId: item.variantId || null,
        sku,
        qty: 0,
        length: numeric(item.variant?.lengthCm),
        width: numeric(item.variant?.widthCm),
        height: numeric(item.variant?.heightCm),
      };
      current.qty += item.qty;
      group.items.set(itemKey, current);
    }
    groups.set(key, group);
  }

  const byVariantTotal = new Map<string, CostTotal>();
  const bySkuTotal = new Map<string, CostTotal>();
  const addTotal = (
    target: Map<string, CostTotal>,
    key: string,
    qty: number,
    allocatedCny: number,
    originalByCurrency: Record<string, number>,
  ) => {
    if (!key || qty <= 0) return;
    const current = target.get(key) || { costCny: 0, qty: 0, originalByCurrency: {} };
    current.costCny += allocatedCny;
    current.qty += qty;
    for (const [currency, amount] of Object.entries(originalByCurrency)) {
      current.originalByCurrency[currency] = (current.originalByCurrency[currency] || 0) + amount;
    }
    target.set(key, current);
  };

  for (const group of groups.values()) {
    const usable = [...group.items.values()].filter((item) => item.qty > 0);
    const volumes = usable.map((item) => item.length * item.width * item.height / 1_000_000 * item.qty);
    const totalVolume = volumes.reduce((sum, value) => sum + value, 0);
    usable.forEach((item, index) => {
      const share = totalVolume > 0 ? volumes[index] / totalVolume : 0;
      const allocatedCny = group.totalCostCny * share;
      const allocatedOriginal = Object.fromEntries(
        Object.entries(group.totalCostOriginalByCurrency).map(([currency, amount]) => [currency, amount * share]),
      );
      addTotal(byVariantTotal, item.variantId || "", item.qty, allocatedCny, allocatedOriginal);
      addTotal(bySkuTotal, item.sku.toLowerCase(), item.qty, allocatedCny, allocatedOriginal);
    });
  }

  const unitCosts = (totals: Map<string, CostTotal>) => new Map<string, FirstMileUnitCost>(
    [...totals]
      .filter(([, value]) => value.qty > 0)
      .map(([key, value]) => [key, {
        cny: value.costCny / value.qty,
        originalByCurrency: Object.fromEntries(
          Object.entries(value.originalByCurrency).map(([currency, amount]) => [currency, amount / value.qty]),
        ),
      }]),
  );

  return { byVariant: unitCosts(byVariantTotal), bySku: unitCosts(bySkuTotal) };
}
