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
  invoiceFeePercent: number;
  remittanceFeePercent: number;
  isCommissionFree: boolean;
  targetRoi?: number | null;
};

function nonnegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
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
  const gmvBrl = effectiveSale * quantity;
  const gmvCny = gmvBrl * rate;

  // The TikTok BR tier contains a percentage commission and a fixed per-item
  // fulfillment charge. Split their display, but never add another 6% SFP fee.
  const tiktokCommissionRatePercent = effectiveSale < 50 ? 10 : 6;
  const tiktokFixedFeePerItemBrl = effectiveSale < 50 ? 4 : 6;
  const tiktokPercentageFeeBrl = input.platform === "TIKTOK" ? gmvBrl * tiktokCommissionRatePercent / 100 : 0;
  const tiktokFixedFeeBrl = input.platform === "TIKTOK" ? tiktokFixedFeePerItemBrl * quantity : 0;
  const tiktokCommissionBrl = tiktokPercentageFeeBrl + tiktokFixedFeeBrl;
  const shopeeTier = input.platform === "SHOPEE" && input.shopeeFeeMode === "CNPJ_LOCAL"
    ? shopeeCnpjLocalFeeTier(effectiveSale) : null;
  const shopeePercentageFeeBrl = shopeeTier ? gmvBrl * shopeeTier.ratePercent / 100 : 0;
  const shopeeFixedFeeBrl = shopeeTier ? shopeeTier.fixedFeePerItemBrl * quantity : 0;
  const platformFeeBrl = input.platform === "TIKTOK"
    ? tiktokPercentageFeeBrl
    : shopeeTier ? shopeePercentageFeeBrl : gmvBrl * nonnegative(input.platformFeePercent) / 100;
  const fulfillmentFeeBrl = tiktokFixedFeeBrl + shopeeFixedFeeBrl + nonnegative(input.fulfillmentFeeBrl);
  const lastMileFeeBrl = nonnegative(input.lastMileFeeBrl);
  const settlementBrl = gmvBrl - platformFeeBrl - fulfillmentFeeBrl - lastMileFeeBrl;
  const settlementCny = settlementBrl * rate;
  const warehouseFeeBrl = nonnegative(input.warehouseFeeBrl);
  const warehouseFeeCny = warehouseFeeBrl * rate;
  const affiliateFeeBrl = nonnegative(input.affiliateFeeBrl);
  const affiliateFeeCny = affiliateFeeBrl * rate;
  const purchaseCostCny = nonnegative(input.purchaseCostCny) * quantity;
  const firstLegCny = nonnegative(input.firstLegCny) * quantity;
  const adCostCny = nonnegative(input.adCostCny) * quantity;
  const taxCostCny = gmvCny * nonnegative(input.taxPercent) / 100;
  const invoiceFeeCny = Math.max(0, settlementCny) * nonnegative(input.invoiceFeePercent) / 100;
  const remittanceFeeCny = Math.max(0, settlementCny) * nonnegative(input.remittanceFeePercent) / 100;
  const nonAdCostCny = purchaseCostCny + firstLegCny + warehouseFeeCny + affiliateFeeCny + taxCostCny
    + invoiceFeeCny + remittanceFeeCny;
  const contributionBeforeAdsCny = settlementCny - nonAdCostCny;
  const netProfitCny = contributionBeforeAdsCny - adCostCny;
  const profitRate = gmvCny > 0 ? netProfitCny / gmvCny * 100 : 0;
  const adRoi = adCostCny > 0 ? gmvCny / adCostCny : 0;
  const breakEvenRoi = contributionBeforeAdsCny > 0 ? gmvCny / contributionBeforeAdsCny : 0;
  const targetRoi = nonnegative(input.targetRoi);
  const targetAdBudgetCny = targetRoi > 0 ? gmvCny / targetRoi : null;
  const expectedProfitCny = targetAdBudgetCny == null ? null : contributionBeforeAdsCny - targetAdBudgetCny;

  return {
    quantity, effectiveSale, gmvBrl, gmvCny, platformFeeBrl, tiktokCommissionBrl,
    tiktokCommissionRatePercent, tiktokFixedFeePerItemBrl, tiktokPercentageFeeBrl, tiktokFixedFeeBrl,
    shopeeFeeMode: input.platform === "SHOPEE" ? input.shopeeFeeMode || "MANUAL" : null,
    shopeeCommissionRatePercent: shopeeTier?.ratePercent ?? null,
    shopeeFixedFeePerItemBrl: shopeeTier?.fixedFeePerItemBrl ?? null,
    shopeePercentageFeeBrl, shopeeFixedFeeBrl,
    fulfillmentFeeBrl, lastMileFeeBrl, settlementBrl,
    settlementCny, purchaseCostCny, firstLegCny, warehouseFeeBrl, warehouseFeeCny,
    adCostCny, affiliateFeeBrl, affiliateFeeCny, taxCostCny, invoiceFeeCny, remittanceFeeCny, nonAdCostCny,
    contributionBeforeAdsCny, netProfitCny, netProfitBrl: rate > 0 ? netProfitCny / rate : 0,
    profitRate, adRoi, breakEvenRoi, breakEvenAdCostCny: Math.max(0, contributionBeforeAdsCny),
    targetAdBudgetCny, expectedProfitCny, expectedProfitBrl: expectedProfitCny == null || rate <= 0
      ? null : expectedProfitCny / rate,
  };
}
