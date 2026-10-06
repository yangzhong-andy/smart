import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeShopeeSettlement,
  shopeeEscrowNeedsRefresh,
  shopeeSettlementStage,
  shopeeSettlementRange,
} from "./shopee-settlements";

test("normalizes official Shopee escrow fees and payout", () => {
  const normalized = normalizeShopeeSettlement({
    order_sn: "ORDER-1",
    return_order_sn_list: [],
    order_income: {
      buyer_total_amount: 65.8,
      commission_fee: 11.84,
      service_fee: 6.24,
      order_ams_commission_fee: 6.58,
      ads_escrow_top_up_fee_or_technical_support_fee: 32.9,
      withholding_tax: 1,
      withholding_vat_tax: 2,
      escrow_amount: 8.24,
      items: [{ item_id: 1 }],
    },
  }, { id: "order-id", orderSn: "ORDER-1", shopSettingId: "setting-id", shopId: "shop-id", currency: "BRL" });
  assert.equal(normalized.commissionFee, "11.84");
  assert.equal(normalized.amsCommissionFee, "6.58");
  assert.equal(normalized.adsEscrowFee, "32.9");
  assert.equal(normalized.withholdingTax, "3");
  assert.equal(normalized.escrowAmountAfterAdjust, "8.24");
});

test("rejects escrow details for a different order", () => {
  assert.throws(() => normalizeShopeeSettlement({ order_sn: "OTHER", order_income: {} }, {
    id: "order-id", orderSn: "ORDER-1", shopSettingId: "setting-id", shopId: "shop-id", currency: "BRL",
  }), /different order number/);
});

test("uses a bounded historical settlement range", () => {
  const now = new Date("2026-08-30T00:00:00Z");
  assert.equal(shopeeSettlementRange(900, now).toISOString(), "2024-08-30T00:00:00.000Z");
});

test("accepts official Escrow details for paid orders before completion", () => {
  assert.equal(shopeeEscrowNeedsRefresh({
    status: "TO_CONFIRM_RECEIVE",
    updateTime: new Date("2026-08-31T08:00:00Z"),
    settlement: null,
  }), true);
  assert.equal(shopeeEscrowNeedsRefresh({
    status: "UNPAID",
    updateTime: new Date("2026-08-31T08:00:00Z"),
    settlement: null,
  }), false);
});

test("refreshes active Escrow once daily and after an order completes", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  assert.equal(shopeeEscrowNeedsRefresh({
    status: "SHIPPED",
    updateTime: new Date("2026-08-30T00:00:00Z"),
    settlement: { syncedAt: new Date("2026-08-31T10:00:00Z") },
  }, now), true);
  assert.equal(shopeeEscrowNeedsRefresh({
    status: "COMPLETED",
    updateTime: new Date("2026-09-01T11:00:00Z"),
    settlement: { syncedAt: new Date("2026-09-01T10:00:00Z") },
  }, now), true);
  assert.equal(shopeeEscrowNeedsRefresh({
    status: "COMPLETED",
    updateTime: new Date("2026-09-01T10:00:00Z"),
    settlement: { syncedAt: new Date("2026-09-01T11:00:00Z") },
  }, now), false);
});

test("marks order income as estimated until a completed order is refreshed", () => {
  const syncedAt = new Date("2026-09-12T12:00:00Z");
  assert.equal(shopeeSettlementStage(
    { status: "SHIPPED", updateTime: new Date("2026-09-12T11:00:00Z") },
    { syncedAt },
  ), "ESTIMATED");
  assert.equal(shopeeSettlementStage(
    { status: "COMPLETED", updateTime: new Date("2026-09-12T12:01:00Z") },
    { syncedAt },
  ), "ESTIMATED");
  assert.equal(shopeeSettlementStage(
    { status: "COMPLETED", updateTime: new Date("2026-09-12T11:59:00Z") },
    { syncedAt },
  ), "ACTUAL");
  assert.equal(shopeeSettlementStage(
    { status: "COMPLETED", updateTime: null },
    null,
  ), "MISSING");
});
