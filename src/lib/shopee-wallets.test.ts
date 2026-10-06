import assert from "node:assert/strict";
import test from "node:test";
import {
  applySignedWalletAmount,
  normalizeAutoTopupRate,
  normalizeCurrency,
  normalizeWalletKind,
  validateInternalTransfer,
} from "./shopee-wallets";
import {
  settlementIsFinal,
  settlementWalletAdjustmentAmount,
  settlementWalletAdjustmentSourceId,
  settlementWalletCreditAmount,
} from "./shopee-wallet-settlement-sync";
import { parseShopeeResponseJson } from "./shopee-open-api";
import {
  classifyShopeeWalletTransaction,
  normalizeShopeeWalletTransaction,
  SHOPEE_WALLET_WINDOW_SECONDS,
  splitShopeeWalletWindows,
} from "./shopee-wallet-transactions";
import { officialBalanceMatches, officialWalletEntryType } from "./shopee-wallet-official-ledger";
import { officialWalletBusinessKind, shopeeWithdrawalCashFlowUid } from "./shopee-wallet-business-sync";

test("keeps Shopee wallet money at two decimal places", () => {
  assert.deepEqual(applySignedWalletAmount(100, -12.345), {
    balanceBefore: 100,
    amount: -12.35,
    balanceAfter: 87.65,
  });
});

test("rejects an amount that would make a platform wallet negative", () => {
  assert.throws(() => applySignedWalletAmount(10, -10.01), /余额不足/);
});

test("allows an incoming funding entry to reduce an existing negative advertising wallet balance", () => {
  assert.deepEqual(applySignedWalletAmount(-12_921.3, 3_000), {
    balanceBefore: -12_921.3,
    amount: 3_000,
    balanceAfter: -9_921.3,
  });
  assert.throws(() => applySignedWalletAmount(-12_921.3, -1), /余额不足/);
});

test("converts an auto top-up percentage to a stored fractional rate", () => {
  assert.equal(normalizeAutoTopupRate(12.5), 0.125);
  assert.throws(() => normalizeAutoTopupRate(101), /0% 到 100%/);
});

test("allows only same-shop store-to-advertising transfers", () => {
  assert.equal(validateInternalTransfer(
    { id: "store", shopSettingId: "shop", walletType: "STORE", currency: "BRL", balance: 100 },
    { id: "ad", shopSettingId: "shop", walletType: "ADVERTISING", currency: "BRL" },
    20,
  ).debit.balanceAfter, 80);
  assert.throws(() => validateInternalTransfer(
    { id: "store", shopSettingId: "shop-a", walletType: "STORE", currency: "BRL", balance: 100 },
    { id: "ad", shopSettingId: "shop-b", walletType: "ADVERTISING", currency: "BRL" },
    20,
  ), /同一家店铺/);
});

test("normalizes wallet identity fields", () => {
  assert.equal(normalizeWalletKind(" advertising "), "ADVERTISING");
  assert.equal(normalizeCurrency("brl"), "BRL");
});

test("credits only positive settlement money rounded to cents", () => {
  assert.equal(settlementWalletCreditAmount("123.456"), 123.46);
  assert.equal(settlementWalletCreditAmount(0), 0);
  assert.equal(settlementWalletCreditAmount(-10), 0);
  assert.equal(settlementWalletCreditAmount("invalid"), 0);
});

test("posts only the delta when Shopee revises an existing settlement", () => {
  assert.equal(settlementWalletAdjustmentAmount("45.07", "15.74"), 29.33);
  assert.equal(settlementWalletAdjustmentAmount("45.07", "47.32"), -2.25);
  assert.equal(settlementWalletAdjustmentAmount("45.07", "45.07"), 0);
  assert.equal(
    settlementWalletAdjustmentSourceId("settlement-1", new Date("2026-09-16T12:00:00.000Z"), 45.07),
    "settlement-1:2026-09-16T12:00:00.000Z:45.07",
  );
});

test("requires a final settlement snapshot before wallet credit", () => {
  const completedAt = new Date("2026-09-14T10:00:00.000Z");
  assert.equal(settlementIsFinal({
    orderStatus: "COMPLETED",
    orderUpdatedAt: completedAt,
    settlementSyncedAt: new Date("2026-09-14T10:00:01.000Z"),
  }), true);
  assert.equal(settlementIsFinal({
    orderStatus: "COMPLETED",
    orderUpdatedAt: completedAt,
    settlementSyncedAt: new Date("2026-09-14T09:59:59.000Z"),
  }), false);
  assert.equal(settlementIsFinal({
    orderStatus: "SHIPPED",
    orderUpdatedAt: completedAt,
    settlementSyncedAt: new Date("2026-09-14T10:00:01.000Z"),
  }), false);
});

test("preserves Shopee official wallet transaction IDs beyond Number.MAX_SAFE_INTEGER", () => {
  const payload = parseShopeeResponseJson('{"response":{"transaction_list":[{"transaction_id":248977522706880143,"withdrawal_id":0}]}}');
  assert.equal(payload.response.transaction_list[0].transaction_id, "248977522706880143");
  assert.equal(payload.response.transaction_list[0].withdrawal_id, 0);
});

test("normalizes official wallet outflow as a signed amount", () => {
  const row = normalizeShopeeWalletTransaction({
    transaction_id: "248977522706880143",
    status: "COMPLETED",
    transaction_type: "SPM_DEDUCT",
    amount: 5000,
    current_balance: 100,
    create_time: 1_789_397_368,
    order_sn: "",
    money_flow: "MONEY_OUT",
  });
  assert.equal(row.transactionId, "248977522706880143");
  assert.equal(row.amount, -5000);
  assert.equal(row.moneyFlow, "MONEY_OUT");
  assert.equal(row.orderSn, null);
});

test("splits official wallet history into non-overlapping seven-day windows", () => {
  const windows = splitShopeeWalletWindows(100, 100 + SHOPEE_WALLET_WINDOW_SECONDS + 10);
  assert.deepEqual(windows, [
    { timeFrom: 100, timeTo: 100 + SHOPEE_WALLET_WINDOW_SECONDS - 1 },
    { timeFrom: 100 + SHOPEE_WALLET_WINDOW_SECONDS, timeTo: 100 + SHOPEE_WALLET_WINDOW_SECONDS + 10 },
  ]);
});

test("matches official order income without posting it twice", () => {
  assert.deepEqual(classifyShopeeWalletTransaction({
    status: "COMPLETED",
    moneyFlow: "MONEY_IN",
    amount: 45.07,
    orderSn: "260908GMUA0Y0M",
    settlementEntries: [{ id: "entry-1", amount: "15.74" }, { id: "adjustment-1", amount: "29.33" }],
  }), { matchStatus: "MATCHED_SETTLEMENT", matchedEntryId: "entry-1" });
  assert.deepEqual(classifyShopeeWalletTransaction({
    status: "COMPLETED",
    moneyFlow: "MONEY_IN",
    amount: 39.84,
    orderSn: "2609058TGM4R0D",
    settlementEntries: [{ id: "entry-1", amount: "39.84" }],
  }), { matchStatus: "MATCHED_SETTLEMENT", matchedEntryId: "entry-1" });
  assert.deepEqual(classifyShopeeWalletTransaction({
    status: "COMPLETED",
    moneyFlow: "MONEY_OUT",
    amount: -5000,
    orderSn: null,
    settlementEntries: [],
  }), { matchStatus: "REVIEW_OUTFLOW", matchedEntryId: null });
});

test("maps official wallet movements to auditable ledger entry types", () => {
  assert.equal(officialWalletEntryType("ESCROW_VERIFIED_ADD", "MONEY_IN"), "OFFICIAL_WALLET_IN");
  assert.equal(officialWalletEntryType("SPM_DEDUCT", "MONEY_OUT"), "OFFICIAL_WALLET_PAYMENT_OUT");
  assert.equal(officialWalletEntryType("WITHDRAWAL_CREATED", "MONEY_OUT"), "OFFICIAL_WITHDRAWAL_OUT");
  assert.equal(officialWalletEntryType("ESCROW_VERIFIED_MINUS", "MONEY_OUT"), "OFFICIAL_ORDER_ADJUSTMENT_OUT");
});

test("requires every official movement to reproduce the API balance", () => {
  assert.equal(officialBalanceMatches(100, -20, 80), true);
  assert.equal(officialBalanceMatches(100, 20, 119.99), false);
});

test("separates official ad top-ups from company-account withdrawals", () => {
  assert.equal(officialWalletBusinessKind("SPM_DEDUCT", "MONEY_OUT"), "AD_TOPUP");
  assert.equal(officialWalletBusinessKind("WITHDRAWAL_CREATED", "MONEY_OUT"), "WITHDRAWAL_CREATED");
  assert.equal(officialWalletBusinessKind("WITHDRAWAL_COMPLETED", "MONEY_OUT"), "WITHDRAWAL_COMPLETED");
  assert.equal(officialWalletBusinessKind("ESCROW_VERIFIED_MINUS", "MONEY_OUT"), "ORDER_ADJUSTMENT");
});

test("uses a stable Shopee withdrawal cash-flow idempotency key", () => {
  assert.equal(
    shopeeWithdrawalCashFlowUid("withdrawal-123"),
    "SHOPEE_WITHDRAWAL_withdrawal-123",
  );
});
