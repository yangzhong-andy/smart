export type WarehouseFeeTierInput = {
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minInclusive: boolean;
  maxInclusive: boolean;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
  baseFee: number;
};

export type WarehousePackagingFeeTierInput = {
  minWeightKg: number | null;
  maxWeightKg: number | null;
  minInclusive: boolean;
  maxInclusive: boolean;
  baseFee: number;
};

export type WarehouseFeeInput = {
  pricingMode: "FLAT_UNIT" | "WEIGHT_TIER" | "PACKAGE_TIER";
  billedUnits: number;
  chargeableWeightKg: number;
  packageLengthCm: number;
  packageWidthCm: number;
  packageHeightCm: number;
  baseOrderFee: number;
  firstUnitFee: number;
  additionalUnitFee: number;
  multiSkuFee?: number;
  distinctSkuCount?: number;
  overweightThresholdKg: number | null;
  overweightFeePerKg: number;
  feeTiers: WarehouseFeeTierInput[];
  packagingFeeTiers?: WarehousePackagingFeeTierInput[];
  oversizeThresholdCm?: number | null;
  oversizeFee?: number;
};

export function findWarehouseFeeTier(
  weightKg: number,
  dimensions: [number, number, number],
  tiers: WarehouseFeeTierInput[],
) {
  return tiers.find((tier) => {
    // A package that exceeds a lower tier's dimensions must be promoted to
    // the next tier even when its actual weight is still below that tier's
    // minimum. The upper limits therefore determine the first eligible tier.
    const belowMax = tier.maxWeightKg == null
      || (tier.maxInclusive ? weightKg <= tier.maxWeightKg : weightKg < tier.maxWeightKg);
    const withinLength = tier.maxLengthCm == null || dimensions[0] <= tier.maxLengthCm;
    const withinWidth = tier.maxWidthCm == null || dimensions[1] <= tier.maxWidthCm;
    const withinHeight = tier.maxHeightCm == null || dimensions[2] <= tier.maxHeightCm;
    return belowMax && withinLength && withinWidth && withinHeight;
  });
}

export function calculateWarehouseFulfillmentFee(input: WarehouseFeeInput) {
  if (input.billedUnits <= 0) return { fee: 0, covered: false, tier: null };
  const additionalUnitsFee = Math.max(0, input.billedUnits - 1) * input.additionalUnitFee;
  const multiSkuCharge = Number(input.distinctSkuCount) > 1 ? Math.max(0, Number(input.multiSkuFee) || 0) : 0;

  if (input.pricingMode === "FLAT_UNIT") {
    return {
      fee: input.baseOrderFee + input.firstUnitFee + additionalUnitsFee + multiSkuCharge,
      operationalFee: input.baseOrderFee + input.firstUnitFee + additionalUnitsFee + multiSkuCharge,
      packagingFee: 0,
      oversizeFee: 0,
      covered: true,
      tier: null,
    };
  }

  if (input.chargeableWeightKg <= 0 || input.feeTiers.length === 0) {
    return { fee: 0, covered: false, tier: null };
  }
  const dimensions = [input.packageLengthCm, input.packageWidthCm, input.packageHeightCm]
    .sort((left, right) => right - left) as [number, number, number];
  if (input.pricingMode === "PACKAGE_TIER" && dimensions.some((value) => value <= 0)) {
    return { fee: 0, covered: false, tier: null };
  }

  let tier = findWarehouseFeeTier(input.chargeableWeightKg, dimensions, input.feeTiers);
  let overweightFee = 0;
  if (!tier && input.overweightThresholdKg != null && input.chargeableWeightKg > input.overweightThresholdKg) {
    tier = findWarehouseFeeTier(input.overweightThresholdKg, dimensions, input.feeTiers);
    overweightFee = (input.chargeableWeightKg - input.overweightThresholdKg) * input.overweightFeePerKg;
  }
  if (!tier) return { fee: 0, covered: false, tier: null };

  const operationalFee = input.baseOrderFee + tier.baseFee + additionalUnitsFee + multiSkuCharge + overweightFee;
  const packagingTier = (input.packagingFeeTiers || []).find((packaging) => {
    const aboveMin = packaging.minWeightKg == null
      || (packaging.minInclusive ? input.chargeableWeightKg >= packaging.minWeightKg : input.chargeableWeightKg > packaging.minWeightKg);
    const belowMax = packaging.maxWeightKg == null
      || (packaging.maxInclusive ? input.chargeableWeightKg <= packaging.maxWeightKg : input.chargeableWeightKg < packaging.maxWeightKg);
    return aboveMin && belowMax;
  });
  // Providers charge packaging/handling only when the parcel contains more
  // than one physical/internal unit. A single ordinary SKU x1 has no fee.
  const packagingFee = input.billedUnits > 1 ? (packagingTier?.baseFee || 0) : 0;
  const oversizeFee = input.oversizeThresholdCm != null
    && Math.max(input.packageLengthCm, input.packageWidthCm, input.packageHeightCm) > input.oversizeThresholdCm
    ? Math.max(0, input.oversizeFee || 0)
    : 0;

  return {
    operationalFee,
    packagingFee,
    oversizeFee,
    fee: operationalFee + packagingFee + oversizeFee,
    covered: true,
    tier,
  };
}
