import { Prisma } from "@prisma/client";

export const SHOPEE_ESCROW_ELIGIBLE_STATUSES = [
  "READY_TO_SHIP",
  "PROCESSED",
  "SHIPPED",
  "TO_CONFIRM_RECEIVE",
  "COMPLETED",
] as const;

export const SHOPEE_SETTLEMENT_PUBLIC_SELECT = {
  currency: true,
  buyerTotalAmount: true,
  orderSellingPrice: true,
  originalPrice: true,
  sellerDiscount: true,
  shopeeDiscount: true,
  commissionFee: true,
  netCommissionFee: true,
  serviceFee: true,
  netServiceFee: true,
  sellerTransactionFee: true,
  amsCommissionFee: true,
  adsEscrowFee: true,
  campaignFee: true,
  actualShippingFee: true,
  finalShippingFee: true,
  estimatedShippingFee: true,
  shopeeShippingRebate: true,
  reverseShippingFee: true,
  sellerReturnRefund: true,
  adjustableRefund: true,
  withholdingTax: true,
  escrowAmount: true,
  escrowAmountAfterAdjust: true,
  syncedAt: true,
} satisfies Prisma.ShopeeSettlementSelect;

export function isShopeeEscrowEligible(status: string | null | undefined) {
  return SHOPEE_ESCROW_ELIGIBLE_STATUSES.includes(
    String(status || "").toUpperCase() as (typeof SHOPEE_ESCROW_ELIGIBLE_STATUSES)[number],
  );
}

export type ShopeeSettlementStage = "ACTUAL" | "ESTIMATED" | "MISSING";

export function shopeeSettlementStage(
  order: { status: string | null; updateTime: Date | null },
  settlement: { syncedAt: Date } | null,
): ShopeeSettlementStage {
  if (!settlement) return "MISSING";
  if (String(order.status || "").toUpperCase() !== "COMPLETED") return "ESTIMATED";
  if (order.updateTime && settlement.syncedAt < order.updateTime) return "ESTIMATED";
  return "ACTUAL";
}

export function shopeeEscrowNeedsRefresh(
  order: { status: string | null; updateTime: Date | null; settlement: { syncedAt: Date } | null },
  now = new Date(),
) {
  const status = String(order.status || "").toUpperCase();
  if (!isShopeeEscrowEligible(status)) return false;
  if (!order.settlement) return true;
  if (status === "COMPLETED" && order.updateTime && order.updateTime > order.settlement.syncedAt) return true;
  if (status !== "COMPLETED") {
    return order.settlement.syncedAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000;
  }
  return false;
}

function decimal(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(value) : null;
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeShopeeSettlement(
  raw: Record<string, any>,
  order: { id: string; orderSn: string; shopSettingId: string; shopId: string; currency: string | null },
) {
  const income = raw?.order_income && typeof raw.order_income === "object" ? raw.order_income : null;
  if (!income) throw new Error(`Shopee escrow detail for ${order.orderSn} has no order_income`);
  const buyerPayment = raw?.buyer_payment_info && typeof raw.buyer_payment_info === "object"
    ? raw.buyer_payment_info
    : null;
  const responseOrderSn = String(raw.order_sn || order.orderSn).trim();
  if (responseOrderSn !== order.orderSn) throw new Error(`Shopee escrow detail returned a different order number`);
  const withholdingTax = [
    income.withholding_tax,
    income.withholding_vat_tax,
    income.withholding_cit_tax,
    income.withholding_pit_tax,
  ].reduce((sum, value) => sum + amount(value), 0);

  return {
    shopSettingId: order.shopSettingId,
    shopId: order.shopId,
    orderId: order.id,
    orderSn: order.orderSn,
    currency: order.currency || null,
    buyerTotalAmount: decimal(buyerPayment?.buyer_total_amount ?? income.buyer_total_amount),
    orderSellingPrice: decimal(income.order_selling_price ?? income.order_discounted_price),
    originalPrice: decimal(income.original_price ?? income.order_original_price),
    sellerDiscount: decimal(income.seller_discount ?? income.order_seller_discount),
    shopeeDiscount: decimal(income.shopee_discount),
    commissionFee: decimal(income.commission_fee),
    netCommissionFee: decimal(income.net_commission_fee),
    serviceFee: decimal(income.service_fee),
    netServiceFee: decimal(income.net_service_fee),
    sellerTransactionFee: decimal(income.seller_transaction_fee),
    amsCommissionFee: decimal(income.order_ams_commission_fee),
    adsEscrowFee: decimal(income.ads_escrow_top_up_fee_or_technical_support_fee),
    campaignFee: decimal(income.campaign_fee),
    actualShippingFee: decimal(income.actual_shipping_fee),
    finalShippingFee: decimal(income.final_shipping_fee),
    estimatedShippingFee: decimal(income.estimated_shipping_fee),
    shopeeShippingRebate: decimal(income.shopee_shipping_rebate),
    reverseShippingFee: decimal(income.reverse_shipping_fee),
    sellerReturnRefund: decimal(income.seller_return_refund),
    adjustableRefund: decimal(income.drc_adjustable_refund),
    withholdingTax: decimal(withholdingTax),
    escrowAmount: decimal(income.escrow_amount),
    escrowAmountAfterAdjust: decimal(income.escrow_amount_after_adjustment ?? income.escrow_amount),
    returnOrderSns: (Array.isArray(raw.return_order_sn_list) ? raw.return_order_sn_list : []) as Prisma.InputJsonValue,
    items: (Array.isArray(income.items) ? income.items : []) as Prisma.InputJsonValue,
    rawData: raw as Prisma.InputJsonValue,
    syncedAt: new Date(),
  };
}

export function shopeeSettlementRange(days = 365, now = new Date()) {
  const safeDays = Math.min(730, Math.max(1, Math.trunc(days)));
  return new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
}
