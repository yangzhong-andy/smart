import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStoreRemittanceReport,
  isStoreRemittanceCategory,
  isValidRemittanceDate,
  type RemittanceFlow,
  type RemittanceStore,
} from "./store-remittance-report";

const now = new Date("2026-09-18T14:00:00.000Z");
const store: RemittanceStore = { id: "store-1", name: "店铺一", platform: "SHOPEE", currency: "BRL", accountId: "account-1" };
const flow = (overrides: Partial<RemittanceFlow> = {}): RemittanceFlow => ({
  id: "flow-1", type: "INCOME", status: "CONFIRMED", category: "回款/店铺回款",
  date: new Date("2026-09-18T00:00:00Z"), amount: 100, currency: "BRL", exchangeRate: 1.3,
  accountId: "account-1", storeId: "store-1", ...overrides,
});

test("normalizes API enums and returns a zero card for every store", () => {
  const result = buildStoreRemittanceReport([store, { ...store, id: "empty", accountId: null }], [flow()], { now });
  assert.equal(result.data.length, 2);
  assert.equal(result.data[0].currencies[0].totalIncome, 100);
  assert.equal(result.data[0].currencies[0].totalIncomeRMB, 130);
  assert.equal(result.data[1].currencies[0].totalIncome, 0);
  assert.equal(result.data[1].currencies[0].trend.length, 6);
  assert.equal(result.summary.totalCny, 130);
});

test("explicit store ID wins over its stale payout account and conflicting account ownership", () => {
  const mercado = { ...store, id: "mercado", name: "美克多", accountId: "3438348964" };
  const companyStore = { ...store, id: "other", accountId: "company-bank" };
  const result = buildStoreRemittanceReport([mercado, companyStore], [flow({ storeId: "mercado", accountId: "company-bank", amount: 7415.06 })], {
    now, accountLinks: [{ id: "company-bank", storeId: "other" }],
  });
  assert.equal(result.data[0].currencies[0].totalIncome, 7415.06);
  assert.equal(result.data[1].currencies[0].totalIncome, 0);
  assert.equal(result.diagnostics.unattributedCount, 0);
});

test("legacy rows use a unique account binding in either direction, without double attribution", () => {
  const stores = [store, { ...store, id: "reverse-linked", accountId: null }];
  const result = buildStoreRemittanceReport(stores, [
    flow({ id: "direct", storeId: null }),
    flow({ id: "reverse", storeId: null, accountId: "reverse-account", amount: 50 }),
  ], { now, accountLinks: [{ id: "account-1", storeId: "store-1" }, { id: "reverse-account", storeId: "reverse-linked" }] });
  assert.equal(result.data[0].currencies[0].totalIncome, 100);
  assert.equal(result.data[1].currencies[0].totalIncome, 50);
  assert.equal(result.summary.currencies[0].totalIncome, 150);
});

test("shared accounts and conflicting forward/reverse bindings stay explicitly unattributed", () => {
  const stores = [store, { ...store, id: "store-2" }, { ...store, id: "store-3", accountId: "conflict-account" }];
  const result = buildStoreRemittanceReport(stores, [
    flow({ id: "shared", storeId: null }),
    flow({ id: "conflict", storeId: null, accountId: "conflict-account", amount: 25 }),
  ], { now, accountLinks: [{ id: "conflict-account", storeId: "store-2" }] });
  assert.equal(result.diagnostics.ambiguousAccountCount, 2);
  assert.equal(result.diagnostics.unattributedCount, 2);
  assert.deepEqual(result.diagnostics.unattributedCurrencies, [{ currency: "BRL", amount: 125, pendingAmount: 0, count: 2, pendingCount: 0 }]);
  assert.equal(result.summary.totalCny, 0);
  assert.ok(result.data.every((row) => row.currencies[0].totalIncome === 0));
});

test("an explicit unknown store never falls back to an otherwise unique bank account", () => {
  const result = buildStoreRemittanceReport([store], [
    flow({ storeId: "deleted-store" }),
    flow({ id: "unbound", storeId: null, accountId: "unknown", amount: 20, status: "PENDING" }),
  ], { now });
  assert.equal(result.diagnostics.unknownStoreCount, 1);
  assert.equal(result.diagnostics.unboundAccountCount, 1);
  assert.equal(result.diagnostics.unattributedCount, 2);
  assert.deepEqual(result.diagnostics.unattributedCurrencies, [{ currency: "BRL", amount: 100, pendingAmount: 20, count: 1, pendingCount: 1 }]);
  assert.equal(result.data[0].currencies[0].totalIncome, 0);
});

test("only explicit remittance categories count, not investments, FX, transfers or generic income", () => {
  for (const category of ["回款", "回款/店铺回款", "回款/平台回款", "回款/其他回款", "店铺回款", "平台回款"]) {
    assert.equal(isStoreRemittanceCategory(category), true, category);
  }
  for (const category of ["内部划拨", "换汇", "投资款", "投资/股东投入", "广告返点", "销售收入", "其他收入", "平台资金/订单冲正"]) {
    assert.equal(isStoreRemittanceCategory(category), false, category);
  }
  const result = buildStoreRemittanceReport([store], [
    flow(), flow({ id: "investment", category: "投资/股东投入" }),
    flow({ id: "transfer", type: "TRANSFER" }), flow({ id: "expense", type: "EXPENSE" }),
    flow({ id: "pending", status: "PENDING", amount: 40 }),
  ], { now });
  const bucket = result.data[0].currencies[0];
  assert.equal(bucket.totalIncome, 100);
  assert.equal(bucket.incomeCount, 1);
  assert.equal(bucket.pendingAmount, 40);
  assert.equal(bucket.pendingCount, 1);
});

test("both reversals and their original remittances are excluded regardless of reversal type", () => {
  const result = buildStoreRemittanceReport([store], [
    flow(), flow({ id: "reversal", amount: -100, isReversal: true, reversedById: "flow-1" }),
    flow({ id: "original-2", amount: 200 }),
    flow({ id: "expense-reversal", type: "EXPENSE", category: "其他", isReversal: true, reversedById: "original-2" }),
    flow({ id: "flagged", isReversed: true }),
    flow({ id: "kept", amount: 12.34 }),
  ], { now });
  assert.equal(result.data[0].currencies[0].totalIncome, 12.34);
  assert.equal(result.data[0].currencies[0].incomeCount, 1);
  assert.equal(result.diagnostics.excludedReversalCount, 4);
});

test("date filters only change period metrics, not total/month/trend or pending confirmation", () => {
  const rows = [
    flow({ id: "older", date: "2026-08-12", amount: 70 }),
    flow({ id: "this-month", date: "2026-09-18", amount: 100 }),
    flow({ id: "pending-old", date: "2026-01-01", amount: 40, status: "PENDING" }),
  ];
  const all = buildStoreRemittanceReport([store], rows, { now });
  const filtered = buildStoreRemittanceReport([store], rows, { now, startDate: "2026-08-01", endDate: "2026-08-31" });
  const a = all.data[0].currencies[0];
  const b = filtered.data[0].currencies[0];
  assert.equal(a.periodIncome, 170);
  assert.equal(b.periodIncome, 70);
  assert.equal(b.periodCount, 1);
  assert.equal(b.totalIncome, a.totalIncome);
  assert.equal(b.thisMonthIncome, a.thisMonthIncome);
  assert.equal(b.pendingAmount, 40);
  assert.deepEqual(b.trend, a.trend);
});

test("Shanghai current month and six month buckets cross year boundaries without moving ledger dates", () => {
  const result = buildStoreRemittanceReport([store], [
    flow({ id: "late-december", date: "2026-12-31T23:59:59.999Z", amount: 10 }),
    flow({ id: "january", date: "2027-01-01T00:00:00.000Z", amount: 20 }),
    flow({ id: "outside-trend", date: "2026-07-31", amount: 40 }),
    flow({ id: "first-trend", date: "2026-08-01", amount: 30 }),
  ], { now: new Date("2026-12-31T16:00:00.000Z"), startDate: "2026-12-31", endDate: "2026-12-31" });
  const bucket = result.data[0].currencies[0];
  assert.equal(result.meta.currentMonth, "2027-01");
  assert.equal(bucket.thisMonthIncome, 20);
  assert.equal(bucket.periodIncome, 10);
  assert.deepEqual(bucket.trend.map((point) => point.month), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.deepEqual(bucket.trend.map((point) => point.amount), [30, 0, 0, 0, 10, 20]);
  assert.equal(bucket.totalIncome, 100);
});

test("more than 5000 rows are all counted", () => {
  const rows = Array.from({ length: 5001 }, (_, index) => flow({ id: `flow-${index}`, amount: "0.01" }));
  const result = buildStoreRemittanceReport([store], rows, { now });
  assert.equal(result.data[0].currencies[0].incomeCount, 5001);
  assert.equal(result.data[0].currencies[0].totalIncome, 50.01);
  assert.equal(result.summary.currencies[0].totalIncome, 50.01);
  assert.equal(result.summary.totalCny, 65.01);
});

test("original currencies stay separate and CNY uses each row's posted rate", () => {
  const result = buildStoreRemittanceReport([store], [
    flow({ id: "brl-1", amount: 100, exchangeRate: 1.2 }),
    flow({ id: "brl-2", amount: 100, exchangeRate: 1.4 }),
    flow({ id: "usd", amount: 10, currency: "USD", exchangeRate: 7 }),
    flow({ id: "cny", amount: 5, currency: "CNY", exchangeRate: 99 }),
    flow({ id: "rmb", amount: 6, currency: "RMB", exchangeRate: null }),
  ], { now });
  assert.deepEqual(result.data[0].currencies.map((bucket) => [bucket.currency, bucket.totalIncome, bucket.totalIncomeRMB]), [
    ["BRL", 200, 260], ["CNY", 11, 11], ["USD", 10, 70],
  ]);
  assert.equal(result.summary.totalCny, 341);
});

test("missing posted FX is explicit and never replaced by an account/current/default rate", () => {
  const result = buildStoreRemittanceReport([store], [
    flow({ id: "missing", exchangeRate: null, date: "2026-08-01" }),
    flow({ id: "good", exchangeRate: 1.3, amount: 20 }),
  ], { now, startDate: "2026-09-01", endDate: "2026-09-30" });
  const bucket = result.data[0].currencies[0];
  assert.equal(bucket.totalIncome, 120);
  assert.equal(bucket.totalIncomeRMB, null);
  assert.equal(bucket.periodIncomeRMB, 26);
  assert.equal(bucket.thisMonthIncomeRMB, 26);
  assert.equal(result.summary.totalCny, null);
  assert.equal(result.summary.periodCny, 26);
  assert.equal(bucket.trend.find((point) => point.month === "2026-08")?.amountRMB, null);
  assert.equal(result.diagnostics.missingExchangeRateCount, 1);
});

test("a posted rate of one is valid and no conversion fallback is invented", () => {
  const result = buildStoreRemittanceReport([store], [flow({ exchangeRate: 1 })], { now });
  assert.equal(result.summary.totalCny, 100);
  assert.equal(result.diagnostics.missingExchangeRateCount, 0);
});

test("invalid amount/date/status rows are diagnosed rather than turned into positive confirmed income", () => {
  const result = buildStoreRemittanceReport([store], [
    flow({ id: "negative", amount: -100 }), flow({ id: "nan", amount: "not-money" }),
    flow({ id: "null", amount: null }), flow({ id: "date", date: "invalid" }),
    flow({ id: "status", status: null }), flow({ id: "legacy-enum", status: undefined, flowStatus: "CONFIRMED", amount: 3 }),
  ], { now });
  assert.equal(result.diagnostics.invalidAmountCount, 3);
  assert.equal(result.diagnostics.invalidDateCount, 1);
  assert.equal(result.diagnostics.unknownStatusCount, 1);
  assert.equal(result.data[0].currencies[0].totalIncome, 3);
});

test("validates calendar dates and rejects reversed ranges", () => {
  assert.equal(isValidRemittanceDate("2026-02-30"), false);
  assert.equal(isValidRemittanceDate("2024-02-29"), true);
  assert.equal(isValidRemittanceDate("2026-9-18"), false);
  assert.throws(() => buildStoreRemittanceReport([store], [], { startDate: "2026-02-30" }), /日期格式/);
  assert.throws(() => buildStoreRemittanceReport([store], [], { startDate: "2026-09-30", endDate: "2026-09-01" }), /开始日期/);
});
