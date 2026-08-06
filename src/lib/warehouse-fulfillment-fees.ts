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
  overweightThresholdKg: number | null;
  overweightFeePerKg: number;
  feeTiers: WarehouseFeeTierInput[];
};

export function findWarehouseFeeTier(
  weightKg: number,
  dimensions: [number, number, number],
  tiers: WarehouseFeeTierInput[],
) {
  return tiers.find((tier) => {
    const aboveMin = tier.minWeightKg == null
      || (tier.minInclusive ? weightKg >= tier.minWeightKg : weightKg > tier.minWeightKg);
    const belowMax = tier.maxWeightKg == null
      || (tier.maxInclusive ? weightKg <= tier.maxWeightKg : weightKg < tier.maxWeightKg);
    const withinLength = tier.maxLengthCm == null || dimensions[0] <= tier.maxLengthCm;
    const withinWidth = tier.maxWidthCm == null || dimensions[1] <= tier.maxWidthCm;
    const withinHeight = tier.maxHeightCm == null || dimensions[2] <= tier.maxHeightCm;
    return aboveMin && belowMax && withinLength && withinWidth && withinHeight;
  });
}

export function calculateWarehouseFulfillmentFee(input: WarehouseFeeInput) {
  if (input.billedUnits <= 0) return { fee: 0, covered: false, tier: null };
  const additionalUnitsFee = Math.max(0, input.billedUnits - 1) * input.additionalUnitFee;

  if (input.pricingMode === "FLAT_UNIT") {
    return {
      fee: input.baseOrderFee + input.firstUnitFee + additionalUnitsFee,
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

  return {
    fee: input.baseOrderFee + tier.baseFee + additionalUnitsFee + overweightFee,
    covered: true,
    tier,
  };
}
