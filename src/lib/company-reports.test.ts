import assert from "node:assert/strict";
import test from "node:test";
import { canReadCompanyReports, completeSum, forecastByCurrency, isInternalMovement, remainingLogisticsRequest, reportCny, reportCsvCell, savedReportRates, sumOriginal, validateReportPeriod, type PlannedMovement } from "./company-reports";
import { financeReportContext, withFinanceReportContext } from "./finance-report-context";

test("company reporting permissions deny ordinary users and missing departments", () => {
  for (const role of ["SUPER_ADMIN", "ADMIN"]) assert.equal(canReadCompanyReports({ role }), true);
  assert.equal(canReadCompanyReports({ role: "USER", departmentCode: "FINANCE_CENTER" }), true);
  assert.equal(canReadCompanyReports({ role: "USER", departmentCode: "GLOBAL_SUPPLY_CHAIN" }), false);
  assert.equal(canReadCompanyReports({ role: "MANAGER" }), false);
});
test("report period validates actual calendar dates and bounds inclusive range to 93 days", () => {
  validateReportPeriod("2026-01-01", "2026-04-03");
  for (const dates of [["2026-01-01", "2026-04-04"], ["2026-02-30", "2026-03-01"], ["2026-10-10", "2026-10-01"], ["", "2026-01-01"], ["2026-2-1", "2026-02-02"]]) assert.throws(() => validateReportPeriod(...dates as [string, string]));
});
test("saved valuation rates never average conflicts or invent a foreign FX rate", () => {
  const rates = savedReportRates([{ currency: "RMB", exchangeRate: 2 }, { currency: "BRL", exchangeRate: 1.3 }, { currency: "BRL", exchangeRate: 1.4 }, { currency: "USD", exchangeRate: 7 }, { currency: "USD", exchangeRate: 7 }, { currency: "HKD", exchangeRate: 0 }]);
  assert.equal(rates.CNY, 1); assert.equal(rates.RMB, 1); assert.equal(rates.BRL, undefined); assert.equal(rates.USD, 7); assert.equal(rates.HKD, undefined);
  assert.equal(reportCny(100, "BRL", rates), null);
  assert.equal(reportCny(0, "BRL", rates), 0);
  assert.equal(reportCny(-10, "USD", rates), -70);
  assert.equal(completeSum([10, null]), null);
  assert.equal(completeSum([10, -3]), 7);
});
test("internal transfer detection includes legacy income/expense transfers, not platform payouts", () => {
  for (const category of ["内部划拨", "内部转账", "账户互转", "财务/换汇", "结汇"]) assert.equal(isInternalMovement("EXPENSE", category), true);
  assert.equal(isInternalMovement("TRANSFER", "其他"), true);
  assert.equal(isInternalMovement("INCOME", "店铺回款"), false);
  assert.equal(isInternalMovement("EXPENSE", "手续费/汇率手续费"), false);
});
test("original currency aggregation normalizes RMB without mixing BRL and USD", () => {
  assert.deepEqual(sumOriginal([{ currency: "RMB", amount: 5 }, { currency: "CNY", amount: 6 }, { currency: "BRL", amount: -2 }, { currency: "USD", amount: 3 }]), { CNY: 11, BRL: -2, USD: 3 });
});
const movement = (overrides: Partial<PlannedMovement>): PlannedMovement => ({ id: "row", label: "计划", currency: "CNY", amount: 10, dueDate: null, direction: "OUT", source: "系统", href: "/", ...overrides });
test("forecast includes overdue unpaid amounts, respects horizon, and never invents an undated receipt date", () => {
  const rows = forecastByCurrency({ CNY: 100, BRL: 80 }, [
    movement({ dueDate: "2026-10-01", amount: 10 }),
    movement({ dueDate: "2026-11-15", amount: 20 }),
    movement({ dueDate: "2027-01-15", amount: 999 }),
    movement({ direction: "IN", dueDate: "2026-10-20", amount: 5 }),
    movement({ direction: "IN", dueDate: null, amount: 999 }),
    movement({ dueDate: null, amount: 8 }),
    movement({ currency: "BRL", dueDate: "2026-10-20", amount: 3 }),
  ], "2026-10-16");
  const cny = rows.filter((row) => row.currency === "CNY");
  assert.equal(cny[0].outgoing, 30); assert.equal(cny[0].closing, 75); assert.equal(cny[0].conservative, 67);
  assert.equal(cny[2].outgoing, 30); assert.equal(cny[2].incoming, 5);
  assert.equal(rows.find((row) => row.currency === "BRL")!.closing, 77);
});
test("unreliable account currency never becomes zero opening or a reassuring forecast", () => {
  const rows = forecastByCurrency({ CNY: null }, [movement({ dueDate: "2026-10-20" })], "2026-10-16");
  for (const row of rows) { assert.equal(row.opening, null); assert.equal(row.closing, null); assert.equal(row.conservative, null); }
});
test("system-only calculation context is scoped, survives awaits, and does not leak to normal profit pages", async () => {
  assert.equal(financeReportContext(), undefined);
  const result = await Promise.all([withFinanceReportContext({ BRL: 1.3 }, async () => { await Promise.resolve(); return financeReportContext()!.rates.BRL; }), withFinanceReportContext({ BRL: 1.4 }, async () => { await Promise.resolve(); return financeReportContext()!.rates.BRL; })]);
  assert.deepEqual(result, [1.3, 1.4]);
  assert.equal(financeReportContext(), undefined);
  await assert.rejects(withFinanceReportContext({}, async () => { throw new Error("calculation failed"); }));
  assert.equal(financeReportContext(), undefined);
});
test("CSV export preserves real numeric negatives and guards formula-like descriptions", () => {
  assert.equal(reportCsvCell(-15.2), '"-15.2"');
  assert.equal(reportCsvCell("  =SUM(A1)"), '"\'  =SUM(A1)"');
  assert.equal(reportCsvCell("@command"), '"\'@command"');
  assert.equal(reportCsvCell('a,"b"'), '"a,""b"""');
  assert.equal(reportCsvCell(null), '"待核实"');
});
test("logistics partial overlaps are removed only with matching cost identities, currencies and sums", () => {
  const links = [{ id: "a", amount: 10, currency: "CNY" }, { id: "b", amount: 20, currency: "CNY" }];
  assert.equal(remainingLogisticsRequest(30, "CNY", links, new Set(["a"])), 20);
  assert.equal(remainingLogisticsRequest(30, "CNY", links, new Set(["a", "b"])), 0);
  assert.equal(remainingLogisticsRequest(35, "CNY", links, new Set(["a"])), null);
  assert.equal(remainingLogisticsRequest(30, "USD", links, new Set(["a"])), null);
  assert.equal(remainingLogisticsRequest(30, "CNY", links, new Set()), 30);
  const forecast = forecastByCurrency({ CNY: 100 }, [], "2026-10-16", new Set(["CNY"]));
  assert.equal(forecast[0].opening, 100); assert.equal(forecast[0].closing, null);
});
