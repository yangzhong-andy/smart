export const PROFIT_ESTIMATE_PLATFORMS = ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const;
export type ProfitEstimatePlatform = typeof PROFIT_ESTIMATE_PLATFORMS[number];
export const SHOPEE_FEE_MODES = ["CNPJ_LOCAL", "MANUAL"] as const;
export type ShopeeFeeMode = typeof SHOPEE_FEE_MODES[number];

export function isShopeeFeeMode(value: unknown): value is ShopeeFeeMode {
  return typeof value === "string" && SHOPEE_FEE_MODES.includes(value as ShopeeFeeMode);
}

export function shopeeCnpjLocalFeeTier(unitPriceBrl: number): { ratePercent: number; fixedFeePerItemBrl: number } {
  const price = Math.max(0, Number.isFinite(unitPriceBrl) ? unitPriceBrl : 0);
  if (price < 80) return { ratePercent: 20, fixedFeePerItemBrl: 4.5 };
  if (price < 100) return { ratePercent: 14, fixedFeePerItemBrl: 16 };
  if (price < 200) return { ratePercent: 14, fixedFeePerItemBrl: 20 };
  return { ratePercent: 14, fixedFeePerItemBrl: 26 };
}

export const PROFIT_ESTIMATE_LABELS: Record<ProfitEstimatePlatform, string> = {
  TIKTOK: "TikTok Shop 巴西",
  SHOPEE: "Shopee 巴西",
  MERCADO_LIVRE: "Mercado Livre 巴西",
};

export function isProfitEstimatePlatform(value: unknown): value is ProfitEstimatePlatform {
  return typeof value === "string" && PROFIT_ESTIMATE_PLATFORMS.includes(value as ProfitEstimatePlatform);
}

export type ProfitEstimateInput = {
  platform: ProfitEstimatePlatform;
  shopeeFeeMode?: ShopeeFeeMode;
  quantity: number;
  salePriceBrl: number;
  discountSalePriceBrl?: number | null;
  exchangeRate: number;
  purchaseCostCny: number;
  firstLegCny: number;
  adCostCny: number;
  weightKg?: number | null;
  warehouseFeeBrl?: number | null;
  platformFeePercent: number;
  fulfillmentFeeBrl: number;
  lastMileFeeBrl: number;
  affiliateFeeBrl: number;
  taxPercent: number;
  returnRatePercent: number;
  remittanceFeePercent: number;
  isCommissionFree: boolean;
  targetRoi?: number | null;
};

function nonnegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

/** Cost shares use the absolute deduction amount; the displayed amount retains its sign. */
export function estimateGmvSharePercent(amount: number, gmv: number): number | null {
  return Number.isFinite(amount) && Number.isFinite(gmv) && gmv > 0
    ? Math.abs(amount) / gmv * 100 : null;
}

export function estimatedWarehouseFeeBrl(weightKg: number, quantity: number): number {
  const weight = nonnegative(weightKg);
  if (!weight) return 0;
  const base = weight <= 1 ? 3.5 : weight <= 3 ? 4.3 : weight <= 6 ? 5 : weight <= 10 ? 8
    : weight <= 20 ? 14 : weight <= 30 ? 20 : weight <= 40 ? 30 : weight <= 50 ? 33
      : weight <= 60 ? 40 : weight <= 70 ? 47 : 47;
  return base + (Math.max(1, Math.trunc(nonnegative(quantity))) - 1) * 1.5;
}

/** Planning only. Actual profit continues to use official order/settlement data. */
export function calculateProfitEstimate(input: ProfitEstimateInput) {
  const quantity = Math.max(1, Math.trunc(nonnegative(input.quantity)));
  const rate = nonnegative(input.exchangeRate);
  const sale = nonnegative(input.salePriceBrl);
  const discounted = nonnegative(input.discountSalePriceBrl);
  const effectiveSale = discounted > 0 ? discounted : sale;
  // A blank price is an unstarted estimate, not a zero-value order. Do not
  // accrue fixed platform charges or entered costs before there is a sale.
  const hasSale = effectiveSale > 0;
  const billableQuantity = hasSale ? quantity : 0;
  const gmvBrl = effectiveSale * quantity;
  const gmvCny = gmvBrl * rate;

  // The TikTok BR tier contains a percentage commission and a fixed per-item
  // charge. SFP is a separate, fixed 6% fulfillment service fee.
  const tiktokCommissionRatePercent = hasSale ? (effectiveSale < 50 ? 10 : 6) : 0;
  const tiktokFixedFeePerItemBrl = hasSale ? (effectiveSale < 50 ? 4 : 6) : 0;
  const tiktokPercentageFeeBrl = input.platform === "TIKTOK" ? gmvBrl * tiktokCommissionRatePercent / 100 : 0;
  const tiktokFixedFeeBrl = input.platform === "TIKTOK" ? tiktokFixedFeePerItemBrl * billableQuantity : 0;
  const tiktokSfpFeeBrl = input.platform === "TIKTOK" ? gmvBrl * 6 / 100 : 0;
  const tiktokCommissionBrl = tiktokPercentageFeeBrl + tiktokFixedFeeBrl;
  const shopeeTier = hasSale && input.platform === "SHOPEE" && input.shopeeFeeMode === "CNPJ_LOCAL"
    ? shopeeCnpjLocalFeeTier(effectiveSale) : null;
  const shopeePercentageFeeBrl = shopeeTier ? gmvBrl * shopeeTier.ratePercent / 100 : 0;
  const shopeeFixedFeeBrl = shopeeTier ? shopeeTier.fixedFeePerItemBrl * billableQuantity : 0;
  const platformFeeBrl = input.platform === "TIKTOK"
    ? tiktokPercentageFeeBrl
    : shopeeTier ? shopeePercentageFeeBrl : gmvBrl * nonnegative(input.platformFeePercent) / 100;
  const fulfillmentFeeBrl = tiktokSfpFeeBrl + tiktokFixedFeeBrl + shopeeFixedFeeBrl + (hasSale ? nonnegative(input.fulfillmentFeeBrl) : 0);
  const lastMileFeeBrl = hasSale ? nonnegative(input.lastMileFeeBrl) : 0;
  const settlementBrl = gmvBrl - platformFeeBrl - fulfillmentFeeBrl - lastMileFeeBrl;
  const settlementCny = settlementBrl * rate;
  const warehouseFeeBrl = hasSale ? nonnegative(input.warehouseFeeBrl) : 0;
  const warehouseFeeCny = warehouseFeeBrl * rate;
  const affiliateFeeBrl = hasSale ? nonnegative(input.affiliateFeeBrl) : 0;
  const affiliateFeeCny = affiliateFeeBrl * rate;
  const purchaseCostCny = nonnegative(input.purchaseCostCny) * billableQuantity;
  const firstLegCny = nonnegative(input.firstLegCny) * billableQuantity;
  const adCostCny = nonnegative(input.adCostCny) * billableQuantity;
  const taxCostCny = gmvCny * nonnegative(input.taxPercent) / 100;
  const returnLossCny = Math.max(0, settlementCny) * Math.min(100, nonnegative(input.returnRatePercent)) / 100;
  const remittanceFeeCny = Math.max(0, settlementCny) * nonnegative(input.remittanceFeePercent) / 100;
  const nonAdCostCny = purchaseCostCny + firstLegCny + warehouseFeeCny + affiliateFeeCny + taxCostCny
    + returnLossCny + remittanceFeeCny;
  const contributionBeforeAdsCny = settlementCny - nonAdCostCny;
  const netProfitCny = contributionBeforeAdsCny - adCostCny;
  const profitRate = gmvCny > 0 ? netProfitCny / gmvCny * 100 : 0;
  const adRoi = adCostCny > 0 ? gmvCny / adCostCny : 0;
  const breakEvenRoi = contributionBeforeAdsCny > 0 ? gmvCny / contributionBeforeAdsCny : 0;
  const targetRoi = nonnegative(input.targetRoi);
  const targetAdBudgetCny = targetRoi > 0 ? gmvCny / targetRoi : null;
  const expectedProfitCny = targetAdBudgetCny == null ? null : contributionBeforeAdsCny - targetAdBudgetCny;

  return {
    quantity, effectiveSale, gmvBrl, gmvCny, platformFeeBrl, tiktokCommissionBrl, tiktokSfpFeeBrl,
    tiktokCommissionRatePercent, tiktokFixedFeePerItemBrl, tiktokPercentageFeeBrl, tiktokFixedFeeBrl,
    shopeeFeeMode: input.platform === "SHOPEE" ? input.shopeeFeeMode || "MANUAL" : null,
    shopeeCommissionRatePercent: shopeeTier?.ratePercent ?? null,
    shopeeFixedFeePerItemBrl: shopeeTier?.fixedFeePerItemBrl ?? null,
    shopeePercentageFeeBrl, shopeeFixedFeeBrl,
    fulfillmentFeeBrl, lastMileFeeBrl, settlementBrl,
    settlementCny, purchaseCostCny, firstLegCny, warehouseFeeBrl, warehouseFeeCny,
    adCostCny, affiliateFeeBrl, affiliateFeeCny, taxCostCny, returnLossCny, remittanceFeeCny, nonAdCostCny,
    contributionBeforeAdsCny, netProfitCny, netProfitBrl: rate > 0 ? netProfitCny / rate : 0,
    profitRate, adRoi, breakEvenRoi, breakEvenAdCostCny: Math.max(0, contributionBeforeAdsCny),
    targetAdBudgetCny, expectedProfitCny, expectedProfitBrl: expectedProfitCny == null || rate <= 0
      ? null : expectedProfitCny / rate,
  };
}
