import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { NextRequest, NextResponse } from "next/server";
import * as reportContext from "./finance-report-context";
import * as businessTime from "./order-business-time";
import * as paymentFees from "./mercado-livre-payment-fees";

function engine(file: string, dependencies: Record<string, any>, extraCode = "") {
  const code = ts.transpileModule(readFileSync(resolve("src", file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: any = {};
  runInNewContext(code + extraCode, { exports, Date, Error, URL, Set, Map, Promise, console, require: (id: string) => dependencies[id] || {} });
  return exports;
}
test("actual Mercado payment fee adapter skips all token/API work only within report context", async () => {
  let upstream = 0, refreshed = 0;
  const loaded = engine("lib/mercado-livre-profit-report.ts", {
    "@/lib/finance-report-context": reportContext,
    "@/lib/mercado-livre-payment-fees": paymentFees,
    "@/lib/mercado-livre-token-service": { withFreshMercadoLivreToken: async (_id: string, fn: (token: string) => Promise<unknown>) => { refreshed++; return fn("test"); } },
    "@/lib/mercado-livre-api": { getMercadoPagoPayment: async () => { upstream++; return { id: "pay", charges_details: [] }; } },
  }, "\nexports.testPaymentFees = loadMercadoLivrePaymentFees;");
  const accounts = [{ id: "account" }], orders = [{ accountId: "account", externalOrderId: "order", rawData: { payments: [{ id: "pay" }] } }];
  const savedOnly = await reportContext.withFinanceReportContext<{ feesByOrder: Map<string, unknown>; warnings: string[] }>({}, () => loaded.testPaymentFees(accounts, orders));
  assert.equal(savedOnly.feesByOrder.size, 0); assert.ok(savedOnly.warnings.length > 0);
  assert.equal(upstream, 0); assert.equal(refreshed, 0);
  const ordinary = await loaded.testPaymentFees(accounts, orders);
  assert.equal(ordinary.feesByOrder.size, 1); assert.equal(upstream, 1); assert.equal(refreshed, 1);
});
test("actual Shopee profit engine uses persisted ads/rates and does not contact external APIs in system-only mode", async () => {
  let reads = 0;
  const empty = { findMany: async () => [] };
  const prisma = {
    shopeeShopSetting: { findMany: async () => [{ id: "setting", shopId: "shop", shopName: "shop", region: "BR", currency: "BRL", storeId: "store" }] },
    shopeeOrder: empty, profitSkuMapping: empty, productVariant: empty, logisticsCost: empty,
    profitWarehouseSwitchRule: empty, warehouseFulfillmentRule: empty, profitShopCostRule: empty,
    adConsumption: { findMany: async () => { reads++; return [{ date: new Date("2026-10-01T00:00:00Z"), amount: 10, currency: "BRL" }, { date: new Date("2026-10-01T00:00:00Z"), amount: 999, currency: "USD" }]; } },
  };
  const loaded = engine("app/api/shopee/profit/route.ts", {
    "next/server": { NextRequest, NextResponse }, "@/lib/prisma": { prisma },
    "@/lib/api-auth": { requireApiUser: async () => ({ user: { role: "ADMIN" }, response: null }) },
    "@/lib/resource-diagnostics": { withResourceDiagnostics: async (_task: string, fn: Function) => fn({ checkpoint() {} }) },
    "@/lib/finance-report-context": reportContext, "@/lib/order-business-time": businessTime,
    "@/lib/profit-schemes": { normalizeCountryCode: (value: string) => value || "BR" },
    "@/lib/first-mile-logistics": { calculateFirstMileUnitCosts: () => new Map() },
    "@/lib/exchange": { getFinanceRates: () => { throw new Error("unexpected external FX request"); } },
    "@/lib/shopee-ads": { getShopeeDailyAdPerformance: () => { throw new Error("unexpected external ad/token request"); } },
  });
  const result = await reportContext.withFinanceReportContext({ CNY: 1, BRL: 1.3 }, () => loaded.GET(new NextRequest("http://localhost/api/shopee/profit?startDate=2026-10-01&endDate=2026-10-01"))) as NextResponse;
  assert.equal(result.status, 200); assert.equal(reads, 1);
  const body = await result.json();
  assert.equal(body.summary.advertisingCny, 13); // Known local BRL10 only; USD999 isn't silently mixed.
  assert.ok(body.warnings.some((warning: string) => warning.includes("系统已保存")));
  assert.equal(reportContext.financeReportContext(), undefined);
});
test("TikTok system-only mode bypasses live-mode caches and overrides legacy FX fallbacks", () => {
  const source = readFileSync(resolve("src/app/api/profit-report/route.ts"), "utf8");
  assert.match(source, /const cacheable = !financeReportContext\(\)/);
  assert.match(source, /reportContext \? null : await fetchExchangeRates/);
  assert.match(source, /for \(const key of Object\.keys\(rates\)\) delete rates\[key\]/);
  assert.match(source, /Object\.assign\(rates, reportContext\.rates\)/);
});
