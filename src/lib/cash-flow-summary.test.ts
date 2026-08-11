import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCashFlows } from "./cash-flow-summary";

test("summarizes signed cash flows using their currency snapshot rates", () => {
  const summary = summarizeCashFlows([
    { type: "INCOME", amount: 100, currency: "USD", exchangeRate: 7.1 },
    { type: "EXPENSE", amount: -20, currency: "USD", exchangeRate: 7.2 },
    { type: "INCOME", amount: 50, currency: "CNY", exchangeRate: 1 },
  ]);

  assert.equal(summary.transactionCount, 3);
  assert.equal(summary.incomeCount, 2);
  assert.equal(summary.expenseCount, 1);
  assert.equal(summary.totalIncome, 760);
  assert.equal(summary.totalExpense, -144);
  assert.equal(summary.netIncome, 616);
});

test("falls back to the account rate when a foreign flow has no usable snapshot", () => {
  const summary = summarizeCashFlows([
    { type: "income", amount: 10, currency: "BRL", exchangeRate: 1, accountExchangeRate: 1.32 },
  ]);

  assert.ok(Math.abs(summary.totalIncome - 13.2) < 1e-9);
  assert.equal(summary.incomeByCurrency.BRL.original, 10);
  assert.ok(Math.abs(summary.incomeByCurrency.BRL.rmb - 13.2) < 1e-9);
});
