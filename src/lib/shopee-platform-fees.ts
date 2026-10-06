type ShopeeOfficialPlatformFeesInput = {
  commissionFee?: unknown;
  netCommissionFee?: unknown;
  serviceFee?: unknown;
  netServiceFee?: unknown;
  amsCommissionFee?: unknown;
};

function fee(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.abs(parsed) : null;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateShopeeOfficialPlatformFees(input: ShopeeOfficialPlatformFeesInput) {
  const commissionFee = money(fee(input.netCommissionFee) ?? fee(input.commissionFee) ?? 0);
  const serviceFee = money(fee(input.netServiceFee) ?? fee(input.serviceFee) ?? 0);
  const affiliateCommission = money(fee(input.amsCommissionFee) ?? 0);
  return {
    commissionFee,
    serviceFee,
    affiliateCommission,
    total: money(commissionFee + serviceFee + affiliateCommission),
  };
}

export function calculateShopeeFinalAffiliateCommission(
  amsCommissionFee: unknown,
  settlementStatus: string,
) {
  if (settlementStatus !== "ACTUAL") return 0;
  return money(fee(amsCommissionFee) ?? 0);
}
