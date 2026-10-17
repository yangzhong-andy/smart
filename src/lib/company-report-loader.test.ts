import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as reports from "./company-reports";
import * as dates from "./order-business-time";
import * as context from "./finance-report-context";
import { getMonthlyBillPaymentAmount } from "./reconciliation-store";
import { parseRelatedIds } from "./procurement-payment-coverage";

// Isolate every adapter: these tests never touch a real database, cache, or platform.
function moduleFrom(file: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(resolve(process.cwd(), "src", file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  runInNewContext(code, { exports, Date, Error, URL, URLSearchParams, Headers, Set, Map, Promise, console: { error() {} }, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } });
  return exports;
}
const request = () => new NextRequest("http://localhost/api/finance/company-reports?startDate=2026-10-01&endDate=2026-10-31", { headers: { cookie: "session=protected" } });
const stamp = new Date("2026-10-15T12:00:00Z");
const account = (id: string, initial: number, parentId: string | null = null) => ({ id, name: id, currency: "CNY", initialCapital: initial, exchangeRate: 1, parentId, companyEntity: "主体A", accountType: "CORPORATE", accountCategory: parentId ? "VIRTUAL" : "PRIMARY", updatedAt: stamp });
const bill = (id: string, extra: Record<string, unknown> = {}) => ({ id, uid: id, month: "2026-10", billType: "广告", billCategory: "Payable", totalAmount: 30, netAmount: 25, currency: "CNY", dueDate: stamp, paymentFlowId: null, updatedAt: stamp, ...extra });
const expense = (id: string, extra: Record<string, unknown> = {}) => ({ id, uid: id, summary: id, category: "运营费用/办公费用", amount: 10, currency: "CNY", relatedId: null, status: "Approved", date: stamp, paidAt: null, paymentFlowId: null, updatedAt: stamp, ...extra });
function fixture(extra: { overrides?: Record<string, any>; profit?: Record<string, any>; count?: number; failAssets?: boolean; failProfit?: boolean } = {}) {
  const calls: string[] = [];
  const base: Record<string, any> = {
    bankAccount: { findMany: async () => [account("parent", 100), account("child", 200, "parent")] },
    cashFlow: { groupBy: async ({ by }: any) => by.includes("accountId") ? [{ accountId: "child", currency: "CNY", _sum: { amount: 50 }, _max: { updatedAt: stamp } }] : [
      { currency: "CNY", category: "店铺回款", type: "INCOME", _sum: { amount: 100 }, _count: { id: 1 }, _max: { updatedAt: stamp } },
      { currency: "CNY", category: "运营费用/办公费用", type: "EXPENSE", _sum: { amount: -20 }, _count: { id: 1 }, _max: { updatedAt: stamp } },
      { currency: "CNY", category: "内部划拨", type: "INCOME", _sum: { amount: 999 }, _count: { id: 1 }, _max: { updatedAt: stamp } },
    ] },
    monthlyBill: { findMany: async () => [bill("bill"), bill("rebate", { billType: "广告返点", billCategory: "Receivable", netAmount: 5 }), bill("factory", { billType: "工厂订单", totalAmount: 1000 })] },
    expenseRequest: { findMany: async () => [expense("standalone"), expense("duplicate-bill", { relatedId: "bill" }), expense("duplicate-payroll", { relatedId: "salary" }), expense("paid-not-updated", { paymentFlowId: "already-posted" })] },
    receivable: { findMany: async () => [{ id: "loan", receivableNo: "loan", counterparty: "其他应收", currentBalance: 15, currency: "CNY", dueDate: null, updatedAt: stamp }] },
    payroll: { findMany: async ({ where }: any) => where.periodLabel ? [{ id: "salary", periodLabel: "2026-10", department: "部门", grossSalary: 100, netSalary: 80, advancePayment: 10, status: "Approved", updatedAt: stamp }] : [{ id: "salary", payrollNo: "salary", periodLabel: "2026-10", netSalary: 80, updatedAt: stamp }] },
    productVariant: { count: async () => 10 },
    logisticsCost: { findMany: async () => [] },
  };
  for (const model of ["tikTokOrder", "shopeeOrder", "mercadoLivreOrder"]) base[model] = { count: async () => extra.count ?? 1, aggregate: async () => ({ _max: { updatedAt: stamp, syncedAt: stamp } }) };
  Object.assign(base, extra.overrides);
  const prisma = new Proxy({}, { get(_target, model: string) {
    assert.ok(model in base, `unexpected model/write: ${model}`);
    return new Proxy(base[model], { get(target, operation: string) { assert.ok(operation in target, `unexpected write ${model}.${operation}`); return async (...args: any[]) => { calls.push(`${model}.${operation}`); return target[operation](...args); }; } });
  } });
  const metric = { orderCount: 1, orders: 1, gmvCny: 100, contributionProfitCny: 60, profitCny: 60, completeOrders: 1, productCoverage: 100, logisticsCoverage: 100, settlementCoverage: 100, originalAmounts: { gmv: { CNY: 100 } }, components: [], ...extra.profit };
  let active = 0, peak = 0;
  const getProfit = async () => {
    assert.ok(context.financeReportContext(), "must be system-only context before calling engine");
    active++; peak = Math.max(peak, active);
    await Promise.resolve(); active--;
    if (extra.failProfit) return NextResponse.json({ error: "source unavailable" }, { status: 500 });
    return NextResponse.json({ summary: metric, stores: [{ ...metric, shopId: "external-shop", shopName: "shop", label: "shop", countryCode: "BR" }], warnings: [] });
  };
  const loaded = moduleFrom("lib/company-report-loader.ts", {
    "next/server": { NextRequest }, "@/lib/prisma": { prisma }, "@/lib/company-reports": reports,
    "@/lib/finance-report-context": context, "@/lib/order-business-time": dates,
    "@/lib/reconciliation-store": { getMonthlyBillPaymentAmount },
    "@/lib/procurement-payment-coverage": { parseRelatedIds },
    "@/app/api/profit-report/route": { GET: getProfit }, "@/app/api/shopee/profit/route": { GET: getProfit },
    "@/app/api/inventory/assets/route": { GET: async () => {
      if (extra.failAssets) return NextResponse.json({}, { status: 500 });
      return NextResponse.json({ summary: { FACTORY: { quantity: 2, values: { CNY: 100 }, missingCostQuantity: 0 }, OVERSEAS: { quantity: 3, values: { CNY: 60 }, missingCostQuantity: 1 } }, totals: { missingCostQuantity: 1, issueSkuCount: 0 }, diagnostics: {} });
    } },
  });
  return { load: () => loaded.loadCompanyReports(request(), "2026-10-01", "2026-10-31") as Promise<reports.CompanyReportResponse>, calls, peak: () => peak };
}
test("six read-only reports preserve own account balances, exclude transfers and do not count payouts as GMV", async () => {
  const f = fixture(); const body = await f.load();
  assert.equal(Object.keys(body.panels).length, 6);
  assert.equal(body.panels.overview.metrics[0].value, 300); // Orders, not cash receipts.
  assert.equal(body.panels.overview.metrics[2].value, 350); // Parent100 + child200 + own50, no parent rollup twice.
  assert.equal(body.panels.cash.metrics[0].value, 80); // 100 - 20, not +999 transfer.
  assert.equal(body.panels.overview.metrics[3].value, null);
  assert.equal(body.panels.position.metrics[3].value, null); // No fake balanced equity.
  assert.equal(f.peak(), 1); // Large engines run sequentially.
  assert.equal(context.financeReportContext(), undefined);
  assert.ok(body.warnings.some((warning) => warning.includes("工厂月账单")));
});
test("obligations use existing cashier amount, correct receivable direction, and exclude explicit duplicates", async () => {
  const body = await fixture().load();
  const plans = body.panels.forecast.tables[1].rows;
  assert.equal(plans.find((row) => row.id === "bill")!.amount, 30); // Official app cashier rule: total, not net25 for ads.
  assert.equal(plans.find((row) => row.id === "rebate")!.direction, "收");
  assert.equal(plans.find((row) => row.id === "rebate")!.amount, 5);
  for (const id of ["factory", "duplicate-bill", "duplicate-payroll", "paid-not-updated"]) assert.equal(plans.some((row) => row.id === id), false);
  assert.equal(plans.find((row) => row.id === "salary")!.amount, 80); // Cash planning uses net.
  assert.equal(body.panels.profit.metrics[2].value, 110); // Accrual uses gross + advance recovery, never net.
  assert.equal(plans.find((row) => row.id === "loan")!.dueDate, "未排期");
});
test("missing foreign FX and failed engines never become reassuring zero profit", async () => {
  const missing = await fixture({ profit: { originalAmounts: { gmv: { BRL: 100 } } } }).load();
  assert.equal(missing.panels.overview.metrics[0].value, null);
  assert.equal(missing.panels.overview.metrics[1].value, null);
  assert.equal(missing.panels.stores.tables[0].rows[0].gmv, null);
  assert.equal(missing.panels.stores.tables[0].rows[0].original, "BRL 100.00");
  const failed = await fixture({ failProfit: true }).load();
  assert.equal(failed.panels.overview.metrics[0].value, null);
  assert.equal(failed.panels.overview.tables[0].rows[0].contribution, null);
  assert.ok(failed.sources.some((row) => row.status.includes("失败")));
});
test("mismatched account currency propagates unknown funds into original-currency forecasts", async () => {
  const f = fixture({ overrides: { cashFlow: { groupBy: async ({ by }: any) => by.includes("accountId") ? [{ accountId: "child", currency: "USD", _sum: { amount: 10 } }] : [] } } });
  const body = await f.load();
  assert.equal(body.panels.overview.metrics[2].value, null);
  assert.equal(body.panels.forecast.tables[0].rows[0].closing, null);
});
test("asset failure remains separate from zero and factory commitments are not called owned inventory", async () => {
  const body = await fixture().load();
  assert.ok(body.panels.position.tables[1].rows.some((row) => String(row.stage).includes("非已确认自有资产")));
  assert.ok(body.panels.position.tables[1].rows.some((row) => row.currency === "待估值" && row.amount === null));
  const failed = await fixture({ failAssets: true }).load();
  assert.ok(failed.sources.some((row) => row.name === "货物资产" && row.status.includes("失败")));
});
test("resource guard refuses excessive order range without calling its profit engine", async () => {
  const body = await fixture({ count: 20_001 }).load();
  assert.equal(body.panels.overview.metrics[1].value, null);
  assert.ok(body.warnings.some((warning) => warning.includes("20,000")));
});
test("batch logistics requests and monthly bills are deduplicated using real cost source links", async () => {
  const f = fixture({ overrides: {
    monthlyBill: { findMany: async () => [bill("logistics-bill", { billType: "物流", consumptionIds: '["cost-a"]', totalAmount: 15, netAmount: 15 })] },
    expenseRequest: { findMany: async () => [expense("batch", { category: "物流/国内物流", amount: 35 })] },
    logisticsCost: { findMany: async () => [{ id: "cost-a", expenseRequestId: "batch", amount: 15, currency: "CNY", cashFlowId: null }, { id: "cost-b", expenseRequestId: "batch", amount: 20, currency: "CNY", cashFlowId: null }] },
  } });
  const body = await f.load();
  const plans = body.panels.forecast.tables[1].rows;
  assert.equal(plans.find((row) => row.id === "logistics-bill")!.amount, 15);
  assert.equal(plans.find((row) => row.id === "batch")!.amount, 20);
});

function apiFixture(user: unknown, work: () => Promise<unknown>) {
  let loads = 0;
  const route = moduleFrom("app/api/finance/company-reports/route.ts", {
    "next/server": { NextRequest, NextResponse }, "@/lib/company-reports": reports,
    "@/lib/api-auth": { requireApiUser: async () => user ? { user, response: null } : { response: NextResponse.json({}, { status: 401 }) } },
    "@/lib/company-report-loader": { loadCompanyReports: async () => { loads++; return work(); } },
  });
  return { get: (req = request()) => route.GET(req), loads: () => loads };
}
test("API authorizes and validates before loading any financial data", async () => {
  const denied = apiFixture({ role: "USER", departmentCode: null }, async () => ({}));
  assert.equal((await denied.get()).status, 403); assert.equal(denied.loads(), 0);
  const anonymous = apiFixture(null, async () => ({}));
  assert.equal((await anonymous.get()).status, 401); assert.equal(anonymous.loads(), 0);
  const admin = apiFixture({ role: "ADMIN" }, async () => ({}));
  assert.equal((await admin.get(new NextRequest("http://localhost/api/finance/company-reports?startDate=2026-02-30&endDate=2026-03-01"))).status, 400);
  assert.equal(admin.loads(), 0);
});
test("API singleflight shares a request, rejects concurrent different range, and reuses compact cache", async () => {
  let finish!: (body: unknown) => void;
  const f = apiFixture({ role: "ADMIN" }, () => new Promise((resolve) => { finish = resolve; }));
  const first = f.get();
  await Promise.resolve(); await Promise.resolve();
  const same = f.get();
  const other = await f.get(new NextRequest("http://localhost/api/finance/company-reports?startDate=2026-09-01&endDate=2026-09-30"));
  assert.equal(other.status, 429); assert.equal(f.loads(), 1);
  finish({ version: 1, generatedAt: "fixture" });
  assert.equal((await first).status, 200); assert.equal((await same).status, 200);
  await Promise.resolve(); await Promise.resolve();
  const cached = await f.get();
  assert.equal(cached.headers.get("X-Report-Cache"), "HIT"); assert.equal(f.loads(), 1);
  assert.equal(cached.headers.get("Cache-Control"), "private, no-store");
});
