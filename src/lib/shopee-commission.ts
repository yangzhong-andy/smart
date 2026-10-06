export type ShopeeCommissionLine = {
  unitPrice: unknown;
  quantity: unknown;
};

export type ShopeeCommissionResult = {
  grossCommission: number;
  pixSubsidy: number;
  netCommission: number;
  isPix: boolean;
};

function numeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function isShopeePixPayment(paymentMethod: string | null | undefined) {
  return String(paymentMethod || "").trim().toLowerCase().includes("pix");
}

export function shopeeCommissionTier(unitPrice: number) {
  if (unitPrice < 80) return { rate: 0.2, fixedFee: 4, pixSubsidyRate: 0 };
  if (unitPrice < 100) return { rate: 0.14, fixedFee: 16, pixSubsidyRate: 0.05 };
  if (unitPrice < 200) return { rate: 0.14, fixedFee: 20, pixSubsidyRate: 0.05 };
  if (unitPrice < 500) return { rate: 0.14, fixedFee: 26, pixSubsidyRate: 0.05 };
  return { rate: 0.14, fixedFee: 26, pixSubsidyRate: 0.08 };
}

export function calculateShopeeCommission(
  lines: ShopeeCommissionLine[],
  paymentMethod: string | null | undefined,
): ShopeeCommissionResult {
  const isPix = isShopeePixPayment(paymentMethod);
  let grossCommission = 0;
  let pixSubsidy = 0;

  for (const line of lines) {
    const unitPrice = Math.max(0, numeric(line.unitPrice));
    const quantity = Math.max(0, Math.trunc(numeric(line.quantity)));
    if (unitPrice <= 0 || quantity <= 0) continue;
    const tier = shopeeCommissionTier(unitPrice);
    grossCommission += (unitPrice * tier.rate + tier.fixedFee) * quantity;
    if (isPix) pixSubsidy += unitPrice * tier.pixSubsidyRate * quantity;
  }

  grossCommission = roundMoney(grossCommission);
  pixSubsidy = roundMoney(Math.min(grossCommission, pixSubsidy));
  return {
    grossCommission,
    pixSubsidy,
    netCommission: roundMoney(Math.max(0, grossCommission - pixSubsidy)),
    isPix,
  };
}
