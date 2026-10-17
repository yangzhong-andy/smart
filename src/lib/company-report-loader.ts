import { NextRequest } from "next/server";
import { GET as getProfit } from "@/app/api/profit-report/route";
import { GET as getShopeeProfit } from "@/app/api/shopee/profit/route";
import { GET as getAssets } from "@/app/api/inventory/assets/route";
import { prisma } from "@/lib/prisma";
import { withFinanceReportContext } from "@/lib/finance-report-context";
import { addBusinessDays, businessDateUtcRangeInTimeZone, businessDateInTimeZone } from "@/lib/order-business-time";
import type { ProfitMetricRow, ProfitReportResponse } from "@/lib/profit-report-types";
import type { InventoryAssetSummaryBucket } from "@/lib/inventory-asset-core";
import { getMonthlyBillPaymentAmount, type BillType } from "@/lib/reconciliation-store";
import { parseRelatedIds } from "@/lib/procurement-payment-coverage";
import {
  completeSum, forecastByCurrency, isInternalMovement, remainingLogisticsRequest, reportCny, reportCurrency,
  roundReportMoney as round, savedReportRates, sumOriginal,
  type CompanyReportResponse, type PlannedMovement, type ReportCell, type ReportPanel, type ReportTable,
} from "@/lib/company-reports";

const MAX_ROWS = 10_000;
const number = (value: unknown) => Number(value || 0);
const amountColumn = { key: "amount", label: "金额（原币）", format: "money" as const };
const cnyColumn = { key: "cny", label: "参考人民币", format: "money" as const };
const panel = (): ReportPanel => ({ metrics: [], tables: [], notes: [] });
const date = (value: Date | null) => value?.toISOString().slice(0, 10) || null;
const latest = (rows: Array<{ updatedAt: Date }>) => rows.length ? new Date(Math.max(...rows.map((row) => row.updatedAt.getTime()))).toISOString() : null;

function subrequest(source: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path, source.url);
  url.search = new URLSearchParams(params).toString();
  const headers = new Headers();
  for (const name of ["cookie", "authorization"]) {
    const value = source.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextRequest(url, { headers });
}

type StoreMetric = {
  platform: string; shopId: string; shopName: string; region: string;
  orders: number; gmv: number | null; costs: number | null; contribution: number | null;
  complete: number; original: string; status: string;
};

/** Uses the existing cost engines but supplies system-only context. They cannot
 * call the upstream APIs/FX service, refresh credentials or reuse live-mode cache. */
async function operating(request: NextRequest, start: string, end: string, rates: Record<string, number>, warnings: string[]) {
  const stores: StoreMetric[] = [];
  const platforms: Array<Record<string, ReportCell>> = [];
  const expenseComponents: Array<Record<string, ReportCell>> = [];
  const sources: CompanyReportResponse["sources"] = [];
  let totalGmv = 0, totalContribution = 0, orders = 0, moneyComplete = true;
  const queryRange = { gte: new Date(`${addBusinessDays(start, -2)}T00:00:00Z`), lt: new Date(`${addBusinessDays(end, 3)}T00:00:00Z`) };
  for (const platform of ["TIKTOK", "SHOPEE", "MERCADO_LIVRE"] as const) {
    try {
      const count = platform === "TIKTOK" ? await prisma.tikTokOrder.count({ where: { createTime: queryRange } })
        : platform === "SHOPEE" ? await prisma.shopeeOrder.count({ where: { createTime: queryRange } })
        : await prisma.mercadoLivreOrder.count({ where: { dateCreated: queryRange } });
      if (count > 20_000) throw new Error("订单超过单次 20,000 笔保护线，请缩短查询期间");
      const recordStamp = platform === "TIKTOK" ? (await prisma.tikTokOrder.aggregate({ where: { createTime: queryRange }, _max: { syncedAt: true } }))._max.syncedAt
        : platform === "SHOPEE" ? (await prisma.shopeeOrder.aggregate({ where: { createTime: queryRange }, _max: { updatedAt: true } }))._max.updatedAt
        : (await prisma.mercadoLivreOrder.aggregate({ where: { dateCreated: queryRange }, _max: { updatedAt: true } }))._max.updatedAt;
      if (count === 0) {
        platforms.push({ platform, orders: 0, gmv: 0, contribution: null, status: "系统该期间无订单；不等于官方无销售" });
        sources.push({ name: `${platform} 订单与成本`, status: "无系统记录", latestRecordAt: null, note: "未调用平台验证授权或完整性" });
        continue;
      }
      const response = await withFinanceReportContext(rates, () => platform === "SHOPEE"
        ? getShopeeProfit(subrequest(request, "/api/shopee/profit", { startDate: start, endDate: end, groupBy: "month", pageSize: "1" }))
        : getProfit(subrequest(request, "/api/profit-report", { startDate: start, endDate: end, groupBy: "month", platform })));
      const body = await response.json();
      if (!response.ok) throw new Error(`成本引擎读取失败（${response.status}）`);
      const notices: string[] = body.warnings || [];
      warnings.push(...notices.map((warning) => `${platform}：${warning}`));
      const normalize = (row: ProfitMetricRow & Record<string, any>) => {
        const isShopee = platform === "SHOPEE";
        const gmv = number(row.gmvCny);
        const contribution = number(isShopee ? row.profitCny : row.contributionProfitCny);
        const count = number(isShopee ? row.orders : row.orderCount);
        const complete = isShopee ? number(row.completeOrders) : Math.floor(count * Math.min(number(row.productCoverage), number(row.logisticsCoverage), number(row.settlementCoverage)) / 100);
        return { gmv, contribution, costs: gmv - contribution, orders: count, complete };
      };
      const summary = normalize(body.summary);
      const missingFx = Object.values(body.summary.originalAmounts || {}).some((amounts) => Object.entries(amounts || {}).some(([currency, value]) => number(value) !== 0 && !rates[reportCurrency(currency)]))
        || notices.some((notice) => /汇率/.test(notice) && /缺|未|无|不可|不能|暂/.test(notice));
      if (missingFx) {
        moneyComplete = false;
        warnings.push(`${platform} 的汇率不完整，人民币汇总显示待核实，不采用引擎缺汇率时的零值。`);
      }
      totalGmv += summary.gmv;
      totalContribution += summary.contribution;
      orders += summary.orders;
      const provisional = notices.length > 0 || summary.complete < summary.orders;
      platforms.push({ platform, orders: summary.orders, gmv: missingFx ? null : round(summary.gmv), contribution: missingFx ? null : round(summary.contribution), status: missingFx ? "缺汇率 / 无法合并" : provisional ? "暂估 / 待核对" : "系统口径已核算 / 未关账" });
      sources.push({ name: `${platform} 订单与成本`, status: provisional ? "暂估 / 有数据缺口" : "已读取 / 未关账", latestRecordAt: recordStamp?.toISOString() || null, note: "最新订单记录更新时间不是同步成功证明；费用沿用已有利润引擎，按店铺目的国业务日" });
      for (const row of body.stores || []) {
        const normalized = normalize(row);
        stores.push({ platform, shopId: row.shopId, shopName: row.shopName || row.label, region: row.countryCode || "未设置", ...normalized,
          gmv: missingFx ? null : normalized.gmv, costs: missingFx ? null : normalized.costs, contribution: missingFx ? null : normalized.contribution,
          original: Object.entries(row.originalAmounts?.gmv || {}).map(([currency, value]) => `${currency} ${number(value).toFixed(2)}`).join(" · "),
          status: provisional || normalized.complete < normalized.orders ? "暂估 / 待核对" : "已核算 / 未关账" });
      }
      if (platform !== "SHOPEE") {
        for (const component of (body as ProfitReportResponse).summary.components) {
          if (!component.includeInProfit) continue;
          expenseComponents.push({ platform, label: component.label, direction: component.direction, cny: missingFx ? null : round(component.amountCny), status: component.sourceStatus });
        }
      } else {
        // Shopee has a different response contract; its canonical total avoids
        // guessing which granular fields overlap platform/shipping components.
        expenseComponents.push({ platform, label: "Shopee 已识别销售成本及费用（合计）", direction: "COST", cny: missingFx ? null : round(summary.costs), status: "暂估 / 见精细利润" });
      }
    } catch (error) {
      moneyComplete = false;
      warnings.push(`${platform}：${error instanceof Error ? error.message : "读取失败"}；未按零利润纳入。`);
      platforms.push({ platform, orders: null, gmv: null, contribution: null, status: "读取失败 / 未纳入" });
      sources.push({ name: `${platform} 订单与成本`, status: "失败 / 未纳入", latestRecordAt: null, note: "请缩短期间或检查原平台模块" });
    }
  }
  warnings.push("Kwai / Amazon 尚未接入本报表的利润核算；公司范围未闭合，不输出正式公司净利润。", "订单 GMV 是经营销售口径，不是财务已确认收入；未完成收入确认、跨期调整与月末关账。");
  return { stores, platforms, expenseComponents, sources, gmv: moneyComplete ? round(totalGmv) : null, contribution: moneyComplete ? round(totalContribution) : null, orders };
}

export async function loadCompanyReports(request: NextRequest, start: string, end: string): Promise<CompanyReportResponse> {
  const readStartedAt = new Date().toISOString();
  const today = businessDateInTimeZone(new Date(), "Asia/Shanghai");
  const warnings: string[] = [];
  const sources: CompanyReportResponse["sources"] = [];
  const periodRange = businessDateUtcRangeInTimeZone(start, end, "Asia/Shanghai");
  const [rawAccounts, balances, flows, bills, expenses, receivables, payroll, currentPayroll] = await Promise.all([
    prisma.bankAccount.findMany({ select: { id: true, name: true, currency: true, initialCapital: true, exchangeRate: true, parentId: true, companyEntity: true, accountType: true, accountCategory: true, updatedAt: true }, take: MAX_ROWS + 1 }),
    prisma.cashFlow.groupBy({ by: ["accountId", "currency"], where: { status: "CONFIRMED", type: { in: ["INCOME", "EXPENSE"] } }, _sum: { amount: true }, _max: { updatedAt: true } }),
    prisma.cashFlow.groupBy({ by: ["currency", "category", "type"], where: { status: "CONFIRMED", date: periodRange }, _sum: { amount: true }, _count: { id: true }, _max: { updatedAt: true } }),
    prisma.monthlyBill.findMany({ where: { status: { in: ["Approved", "Cashier_Approved"] }, paidAt: null }, select: { id: true, uid: true, month: true, billType: true, billCategory: true, consumptionIds: true, totalAmount: true, netAmount: true, currency: true, dueDate: true, updatedAt: true, paymentFlowId: true }, take: MAX_ROWS + 1 }),
    prisma.expenseRequest.findMany({ where: { OR: [{ status: "Approved", paidAt: null }, { status: { in: ["Approved", "Paid"] }, date: periodRange }] }, select: { id: true, uid: true, summary: true, category: true, amount: true, currency: true, relatedId: true, status: true, date: true, paidAt: true, paymentFlowId: true, updatedAt: true }, take: MAX_ROWS + 1 }),
    prisma.receivable.findMany({ where: { status: { in: ["Disbursed", "PartiallyReceived"] } }, select: { id: true, receivableNo: true, counterparty: true, currentBalance: true, currency: true, dueDate: true, updatedAt: true }, take: MAX_ROWS + 1 }),
    prisma.payroll.findMany({ where: { periodLabel: { gte: start.slice(0, 7), lte: end.slice(0, 7) }, status: { in: ["Approved", "Paid"] } }, select: { id: true, periodLabel: true, department: true, grossSalary: true, netSalary: true, advancePayment: true, status: true, updatedAt: true }, take: MAX_ROWS + 1 }),
    prisma.payroll.findMany({ where: { status: "Approved", paidAt: null }, select: { id: true, payrollNo: true, periodLabel: true, netSalary: true, updatedAt: true }, take: MAX_ROWS + 1 }),
  ]);
  for (const rows of [rawAccounts, bills, expenses, receivables, payroll, currentPayroll]) {
    if (rows.length > MAX_ROWS) throw new Error("基础数据超过安全保护线，请使用分期报表；系统没有截断或按零处理");
  }
  const logisticsLinks = expenses.length ? await prisma.logisticsCost.findMany({
    where: { expenseRequestId: { in: expenses.map((row) => row.id) } },
    select: { id: true, amount: true, currency: true, expenseRequestId: true, cashFlowId: true }, take: MAX_ROWS + 1,
  }) : [];
  if (logisticsLinks.length > MAX_ROWS) throw new Error("物流付款来源超过保护线，未进行不完整去重");
  const rates = savedReportRates(rawAccounts.map((row) => ({ currency: row.currency, exchangeRate: number(row.exchangeRate) })));
  const balanceIndex = new Map<string, typeof balances>();
  for (const row of balances) {
    const entries = balanceIndex.get(row.accountId) || [];
    entries.push(row);
    balanceIndex.set(row.accountId, entries);
  }
  const accountRows = rawAccounts.map((account) => {
    const accountFlows = balanceIndex.get(account.id) || [];
    const mismatch = accountFlows.some((row) => reportCurrency(row.currency) !== reportCurrency(account.currency));
    if (mismatch) warnings.push(`账户「${account.name}」存在流水币种与账户币种不一致，余额未参与汇总，请在账户模块核对。`);
    const amount = mismatch ? null : round(number(account.initialCapital) + accountFlows.reduce((sum, row) => sum + number(row._sum.amount), 0));
    return { id: account.id, name: account.name, entity: account.companyEntity || "主体未归属", currency: reportCurrency(account.currency),
      kind: account.accountType === "PLATFORM" ? "平台账面账户" : account.accountCategory === "VIRTUAL" ? "内部子账户" : "银行 / 现金账面账户",
      parentId: account.parentId, amount, cny: amount == null ? null : reportCny(amount, account.currency, rates) };
  });
  const opening: Record<string, number | null> = sumOriginal(accountRows.filter((row) => row.amount != null).map((row) => ({ currency: row.currency, amount: row.amount! })));
  for (const row of accountRows) if (row.amount == null) opening[row.currency] = null;
  const accountCny = completeSum(accountRows.map((row) => row.cny));
  warnings.push("资金余额仅为系统期初资金＋已确认流水，不代表银行/PAGO官方可用余额；未确认流水不纳入。父子账户各自原始余额只统计一次，不累加页面的父账户汇总值。", "汇率仅使用账户中已保存且同币种一致的参考汇率，不是历史入账汇率或期末结账汇率；缺失/冲突时保留原币，人民币显示待核实。");
  const moneyRows = (rows: Array<{ currency: string; amount: number }>) => Object.entries(sumOriginal(rows)).map(([currency, amount]) => ({ currency, amount, cny: reportCny(amount, currency, rates) }));
  const movements: PlannedMovement[] = [];
  const linkedBills = new Set(bills.map((row) => row.id));
  const linkedPayroll = new Set(currentPayroll.map((row) => row.id));
  const billedCostIds = new Set<string>();
  const unknownPayableCurrencies = new Set<string>();
  // One obligation per existing payable document, never add PendingEntry and
  // logistics rows again. Factory monthly bills overlap delivery payment requests.
  for (const bill of bills) {
    if (bill.paymentFlowId) {
      warnings.push(`月账单 ${bill.uid || bill.id} 已有付款流水但仍未结清，未重复纳入计划，请核对状态。`);
      continue;
    }
    if (bill.billType === "工厂订单") {
      warnings.push("工厂月账单与拿货单付款存在覆盖关系：本版只列已审批支出申请，不叠加工厂月账单；未发起申请的采购承诺尚未纳入待付。");
      continue;
    }
    const currency = reportCurrency(bill.currency);
    if (!["Payable", "Receivable"].includes(bill.billCategory)) {
      warnings.push(`月账单 ${bill.uid || bill.id} 收付类别未识别，未纳入计划。`);
      continue;
    }
    movements.push({ id: bill.uid || bill.id, label: `${bill.month} ${bill.billType}`, currency, amount: Math.max(0, getMonthlyBillPaymentAmount({ billType: bill.billType as BillType, totalAmount: number(bill.totalAmount), netAmount: number(bill.netAmount) })), dueDate: date(bill.dueDate), direction: bill.billCategory === "Receivable" ? "IN" : "OUT", source: "已审批月账单", href: "/finance/monthly-bills" });
    if (bill.billCategory === "Payable" && bill.billType === "物流") for (const id of parseRelatedIds(bill.consumptionIds)) billedCostIds.add(id);
  }
  for (const expense of expenses.filter((row) => row.status === "Approved" && !row.paidAt)) {
    if (expense.relatedId && (linkedBills.has(expense.relatedId) || linkedPayroll.has(expense.relatedId))) continue;
    if (expense.paymentFlowId) {
      warnings.push(`支出申请 ${expense.uid || expense.id} 已有付款流水但仍为待付，未重复纳入计划，请核对状态。`);
      continue;
    }
    const remaining = remainingLogisticsRequest(number(expense.amount), expense.currency, logisticsLinks.filter((row) => row.expenseRequestId === expense.id).map((row) => ({ ...row, amount: number(row.amount) })), billedCostIds);
    if (remaining == null) {
      unknownPayableCurrencies.add(reportCurrency(expense.currency));
      warnings.push(`物流支出 ${expense.uid || expense.id} 与月账单存在关联重叠且金额/付款状态不一致，该币种待付与预测余额显示待核实，不猜测扣减。`);
      continue;
    }
    if (remaining <= 0) continue;
    movements.push({ id: expense.uid || expense.id, label: expense.summary, currency: reportCurrency(expense.currency), amount: remaining, dueDate: null, direction: "OUT", source: remaining < number(expense.amount) ? "支出申请（已排除月账单覆盖的物流费用）" : "已审批支出申请（未设到期日）", href: "/finance/approval" });
  }
  for (const row of currentPayroll) movements.push({ id: row.payrollNo || row.id, label: `${row.periodLabel} 工资（实发）`, currency: "CNY", amount: Math.max(0, row.netSalary), dueDate: null, direction: "OUT", source: "已审批未付工资 / 未设发薪日", href: "/hr/payroll" });
  for (const row of receivables) movements.push({ id: row.receivableNo || row.id, label: row.counterparty, currency: reportCurrency(row.currency), amount: Math.max(0, number(row.currentBalance)), dueDate: date(row.dueDate), direction: "IN", source: "已放款其他应收", href: "/finance/receivables" });
  const cashRows = flows.map((row) => ({ currency: reportCurrency(row.currency), category: row.category || "未分类", type: row.type, amount: round(number(row._sum.amount)), count: row._count.id, internal: isInternalMovement(row.type, row.category), cny: reportCny(number(row._sum.amount), row.currency, rates) }));
  const externalCash = cashRows.filter((row) => !row.internal);
  const cashSummary = [...new Set(cashRows.map((row) => row.currency))].sort().map((currency) => {
    const rows = externalCash.filter((row) => row.currency === currency);
    const income = round(rows.filter((row) => row.type === "INCOME").reduce((sum, row) => sum + row.amount, 0));
    const expense = round(rows.filter((row) => row.type === "EXPENSE").reduce((sum, row) => sum + row.amount, 0));
    return { currency, income, expense, net: round(income + expense), internal: round(cashRows.filter((row) => row.currency === currency && row.internal).reduce((sum, row) => sum + row.amount, 0)) };
  });
  const pnlExpenses = expenses.filter((row) => row.date >= periodRange.gte! && row.date < periodRange.lt!
    && ["运营费用/办公费用", "运营费用/差旅费", "运营费用/技术服务费", "运营费用/咨询费"].includes(row.category));
  const overheadCny = completeSum(pnlExpenses.map((row) => reportCny(number(row.amount), row.currency, rates)));
  const payrollCny = round(payroll.reduce((sum, row) => sum + row.grossSalary + row.advancePayment, 0));
  const op = await operating(request, start, end, rates, warnings);
  sources.push(...op.sources);
  const panels = { overview: panel(), profit: panel(), stores: panel(), cash: panel(), position: panel(), forecast: panel() };
  const financialNotes = ["本模块是内部管理分析，不是法定/审计报表；没有生成凭证、修改余额、补录收入或触发同步。", "范围为当前系统数据库的全部主体：暂未做集团合并抵销、主体独立损益或跨系统汇总。未归属主体的业务必须先在原模块补齐。", "期间经营数据与当前资产快照分开：调整查询日期不会把当前库存/待付还原为历史期末余额。各来源顺序读取，不是事务锁定的统一会计时点；最终关账需要另行月结。"];
  const books: ReportTable = { title: "当前账户账面余额（自身余额，不含子级汇总）", columns: [{ key: "name", label: "账户" }, { key: "entity", label: "所属主体" }, { key: "kind", label: "账户性质" }, { key: "currency", label: "币种" }, amountColumn, cnyColumn], rows: accountRows, href: "/finance/accounts", note: "银行、平台与内部子钱包分开展示，均未核验受限资金/官方可用余额。" };
  panels.overview.metrics = [
    { label: "已纳入平台订单 GMV（参考）", value: op.gmv, unit: "CNY", note: "系统订单口径；未覆盖的平台不等于零销售" },
    { label: "已识别店铺贡献（暂估）", value: op.contribution, unit: "CNY", note: "缺成本/费用可能高估，不是公司净利润" },
    { label: "当前系统账面资金", value: accountCny, unit: "CNY", note: "参考汇率估值；不是官方可动用现金" },
    { label: "公司净利润", value: null, unit: "CNY", note: "收入确认、全量费用、关账和合并抵销尚未完成" },
  ];
  panels.overview.tables = [{ title: "平台经营范围与核算状态", columns: [{ key: "platform", label: "平台" }, { key: "orders", label: "有效订单", format: "number" }, { key: "gmv", label: "订单 GMV / CNY", format: "money" }, { key: "contribution", label: "暂估贡献 / CNY", format: "money" }, { key: "status", label: "数据状态" }], rows: [...op.platforms, { platform: "KWAI / AMAZON", orders: null, gmv: null, contribution: null, status: "利润核算暂未接入" }], href: "/finance/platform-profit-summary" }];
  panels.overview.notes = financialNotes;
  panels.profit.metrics = [{ label: "已识别店铺贡献（暂估）", value: op.contribution, unit: "CNY", note: "沿用已有成本引擎，不重复加平台回款" }, { label: "已识别公司费用（参考）", value: overheadCny, unit: "CNY", note: "仅办公、差旅、技术服务、咨询；不是全部费用" }, { label: "所选月份已审批工资成本", value: payrollCny, unit: "CNY", note: "按整月已审批工资：税前应发＋扣回预支；不含雇主社保" }, { label: "完整经营净利润", value: null, unit: "CNY", note: "缺全量归属与关账，暂不输出" }];
  panels.profit.tables = [
    { title: "管理利润桥（非收入确认利润表）", columns: [{ key: "label", label: "项目" }, cnyColumn, { key: "status", label: "口径 / 状态" }], rows: [
      { label: "已纳入平台订单 GMV", cny: op.gmv, status: "按订单业务日，非财务收入确认" },
      { label: "减：店铺已识别成本与费用", cny: op.gmv == null || op.contribution == null ? null : round(op.gmv - op.contribution), status: "包含商品、物流、平台、广告、税费等已知成本；缺项见提示" },
      { label: "等于：店铺贡献（暂估）", cny: op.contribution, status: "未扣所有公司公共费用" },
      { label: "减：已识别办公 / 差旅 / 技术 / 咨询", cny: overheadCny, status: "按支出申请业务日期；跨期服务未摊销" },
      { label: "减：所选月份已审批税前工资＋预支扣回", cny: payrollCny, status: "整月合计；查询半月时也不按日虚构分摊" },
      { label: "完整公司净利润", cny: null, status: "待收入确认、全量费用归属及月末关账" },
    ] },
    { title: "已有引擎的成本组件", columns: [{ key: "platform", label: "平台" }, { key: "label", label: "核算项" }, { key: "direction", label: "方向" }, cnyColumn, { key: "status", label: "来源状态" }], rows: op.expenseComponents, href: "/finance/profit" },
    { title: "已识别公司费用来源", columns: [{ key: "id", label: "申请号" }, { key: "category", label: "类别" }, { key: "currency", label: "币种" }, amountColumn, cnyColumn], rows: pnlExpenses.map((row) => ({ id: row.uid || row.id, category: row.category, currency: row.currency, amount: number(row.amount), cny: reportCny(number(row.amount), row.currency, rates) })), href: "/finance/approval" },
  ];
  panels.profit.notes = ["采购付款不直接计本期成本：商品成本随销售核算，未售商品在货物资产中展示。平台回款只是应收转资金，账户划拨也不是新增销售。", "公共费用只纳入明确、不与订单引擎重叠的四类费用；营销、物流、税费、其他费用的跨模块归属仍待建立。工资按月份计成本，发薪流水只出现在收支表，不重复扣利润。", "工资口径尚不含雇主社保、公积金；折旧、无形资产摊销、存货跌价、坏账、融资成本和汇兑损益尚未全面纳入。"];
  panels.stores.metrics = [{ label: "已纳入有效订单", value: op.orders, unit: "笔", note: "各平台有效订单定义沿用原模块" }, { label: "已纳入店铺", value: op.stores.length, unit: "家", note: "非零订单店铺；空白/失败平台见数据质量" }];
  panels.stores.tables = [{ title: "店铺经营与成本覆盖", columns: [{ key: "platform", label: "平台" }, { key: "shopName", label: "店铺" }, { key: "shopId", label: "店铺 ID" }, { key: "region", label: "国家" }, { key: "orders", label: "订单", format: "number" }, { key: "original", label: "原币 GMV" }, { key: "gmv", label: "GMV / CNY", format: "money" }, { key: "costs", label: "已识别成本 / CNY", format: "money" }, { key: "contribution", label: "暂估贡献 / CNY", format: "money" }, { key: "status", label: "核算状态" }], rows: op.stores, href: "/finance/platform-profit-summary" }];
  panels.stores.notes = ["店铺贡献不等于店铺净利润：不擅自分摊公司公共费用。目的国业务日沿用各平台原模块；与按北京时间统计的付款日不强行视为同一天。", "人民币利润受参考汇率和成本缺项影响；原币 GMV 保留，缺失费用未被认定为零费用。"];
  panels.cash.metrics = [{ label: "期间外部账面净流入（参考）", value: completeSum(externalCash.map((row) => row.cny)), unit: "CNY", note: "只含已确认流水；剔除已识别内部转账/换汇" }];
  panels.cash.tables = [
    { title: "按原币统计实收实付", columns: [{ key: "currency", label: "币种" }, { key: "income", label: "收入类净发生额", format: "money" }, { key: "expense", label: "支出类净发生额（带符号）", format: "money" }, { key: "net", label: "外部净流入", format: "money" }, { key: "internal", label: "内部划拨净额（排除）", format: "money" }], rows: cashSummary },
    { title: "外部资金用途", columns: [{ key: "currency", label: "币种" }, { key: "category", label: "现有流水分类" }, { key: "type", label: "类型" }, { key: "count", label: "笔数", format: "number" }, amountColumn, cnyColumn], rows: externalCash.map(({ internal, ...row }) => row), href: "/finance/cash-flow" },
    { title: "排除的内部资金移动", columns: [{ key: "currency", label: "币种" }, { key: "category", label: "分类" }, amountColumn], rows: cashRows.filter((row) => row.internal).map(({ internal, ...row }) => row), note: "识别依赖既有类型与分类；分类错误须回流水模块修正，不能仅靠金额相等判定。" },
  ];
  panels.cash.notes = ["按北京时间的流水业务日期统计；红冲保留原记录和冲销记录的符号，不直接删除原单。", "这是一张管理收支表，不是法定现金流量表。投资、融资、经营活动分类以及受限资金重分类将在会计映射建立后扩展。"];
  const payableRows = movements.filter((row) => row.direction === "OUT");
  const receivableRows = movements.filter((row) => row.direction === "IN");
  panels.position.metrics = [{ label: "账面资金（参考）", value: accountCny, unit: "CNY", note: "包含平台账面与内部子钱包，未核实可用性" }, { label: "已识别应收承诺", value: completeSum(receivableRows.map((row) => reportCny(row.amount, row.currency, rates))), unit: "CNY", note: "已放款其他应收与审批应收账单；不含未入系统的平台未释放结算款" }, { label: "已识别待付承诺", value: unknownPayableCurrencies.size ? null : completeSum(payableRows.map((row) => reportCny(row.amount, row.currency, rates))), unit: "CNY", note: "审批口径，不等于全部会计负债" }, { label: "净资产", value: null, unit: "CNY", note: "固定资产、完整负债和权益缺失，不强行配平" }];
  panels.position.tables = [books];
  // Inventory engine is reused in sequence, not alongside three profit engines.
  try {
    if (await prisma.productVariant.count() > 30_000) throw new Error("SKU 超过单次资产估值保护线");
    const response = await getAssets(subrequest(request, "/api/inventory/assets", {}));
    const assets = await response.json();
    if (!response.ok) throw new Error("货物资产引擎读取失败");
    const labels: Record<string, string> = { FACTORY: "工厂未提货（采购承诺，非已确认自有资产）", DOMESTIC: "国内待发", SEA_TRANSIT: "头程在途", OVERSEAS: "海外仓" };
    const rows: Array<Record<string, ReportCell>> = Object.entries(assets.summary as Record<string, InventoryAssetSummaryBucket>).flatMap(([bucket, row]) => Object.entries(row.values).map(([currency, amount]) => ({ stage: labels[bucket], quantity: row.quantity, currency, amount, cny: reportCny(amount, currency, rates), missing: row.missingCostQuantity })));
    for (const [bucket, row] of Object.entries(assets.summary as Record<string, InventoryAssetSummaryBucket>)) if (row.missingCostQuantity || !Object.keys(row.values).length) rows.push({ stage: labels[bucket], quantity: row.quantity, currency: "待估值", amount: row.quantity === 0 ? 0 : null, cny: row.quantity === 0 ? 0 : null, missing: row.missingCostQuantity });
    panels.position.tables.push({ title: "货物阶段估值 / 采购承诺（当前快照）", columns: [{ key: "stage", label: "阶段" }, { key: "quantity", label: "该阶段总件数", format: "number" }, { key: "currency", label: "估值币种" }, amountColumn, cnyColumn, { key: "missing", label: "阶段缺成本件数", format: "number" }], rows, href: "/inventory/assets", note: "各币种行共享阶段数量，数量不可跨币种重复加总。工厂未提货单独作采购承诺，不直接并入自有存货。估值沿用现有采购/产品成本，非含税含运费的完整落地成本。" });
    if (assets.totals.missingCostQuantity || assets.totals.issueSkuCount || Object.values(assets.diagnostics || {}).some((value) => typeof value === "number" && value > 0)) warnings.push("货物资产存在未关联、缺成本或单据数量异常，请进入货物资产页处理；未估值部分没有按零资产认定。");
    sources.push({ name: "货物资产", status: "当前系统快照 / 暂估", latestRecordAt: null, note: "复用现有库存资产引擎；查询时点不是单据更新时间或官方核实时间" });
  } catch {
    warnings.push("货物资产估值读取失败或超出安全保护线，未按零资产计入。请单独查看货物资产模块。");
    sources.push({ name: "货物资产", status: "失败 / 未纳入", latestRecordAt: null, note: "请单独检查原资产模块" });
  }
  panels.position.tables.push({ title: "已识别应收 / 待付（按原币）", columns: [{ key: "side", label: "性质" }, { key: "currency", label: "币种" }, amountColumn, cnyColumn], rows: [...moneyRows(receivableRows).map((row) => ({ side: "已放款其他应收及审批应收账单", ...row })), ...moneyRows(payableRows).map((row) => ({ side: "已审批待付承诺", ...row, ...(unknownPayableCurrencies.has(row.currency) ? { amount: null, cny: null } : {}) }))] });
  panels.position.notes = [...financialNotes.slice(1), "不将平台结算余额、订单 GMV 与钱包余额再次相加。固定资产、预付、平台未释放应收、借款负债、税费/社保应付、权益及存货跌价尚未形成完整核算，因此不输出资产总额/负债总额/净资产。"];
  panels.forecast.tables = [
    { title: `未来资金情景（基准日 ${today}，北京时间）`, columns: [{ key: "currency", label: "币种" }, { key: "days", label: "未来天数", format: "number" }, { key: "opening", label: "当前账面资金", format: "money" }, { key: "incoming", label: "已排期应收", format: "money" }, { key: "outgoing", label: "已排期待付（含逾期）", format: "money" }, { key: "closing", label: "排期后账面余额", format: "money" }, { key: "undatedOut", label: "未排期待付", format: "money" }, { key: "conservative", label: "再扣未排期待付", format: "money" }], rows: forecastByCurrency(opening, movements, today, unknownPayableCurrencies) },
    { title: "现有单据的收付计划明细", columns: [{ key: "id", label: "来源单号" }, { key: "source", label: "业务来源" }, { key: "direction", label: "收 / 付" }, { key: "label", label: "摘要" }, { key: "currency", label: "币种" }, amountColumn, { key: "dueDate", label: "既有到期日" }], rows: movements.map((row) => ({ id: row.id, source: row.source, direction: row.direction === "IN" ? "收" : "付", label: row.label, currency: row.currency, amount: row.amount, dueDate: row.dueDate || "未排期" })), href: "/finance/monthly-bills" },
  ];
  panels.forecast.notes = ["计划始终以今天及当前未结单据为基准，与上方历史经营期间无关。逾期未结款计入各档最近计划，不忽略逾期。未排期应收不作为确定可回收现金。", "这是账面资金情景，不是可用现金承诺：平台未释放/受限资金、提现时差与账户间调拨限制尚未核实。未扣未审批草稿、未发起采购款、未来广告/税费及未生成工资，不能据此直接安排付款。", "不预测尚未确认的销售回款日期、不虚构发薪日。已关联月账单和工资的支出申请不重复叠加；付款状态异常回原模块核对。"];
  sources.push(
    { name: "账户与已确认流水", status: "已读取", latestRecordAt: latest([...rawAccounts, ...balances.flatMap((row) => row._max?.updatedAt ? [{ updatedAt: row._max.updatedAt }] : [])]), note: "仅数据库账面；最新记录更新时间不证明官方对账完成" },
    { name: "待付月账单", status: "审批口径 / 部分范围", latestRecordAt: latest(bills), note: "不叠加工厂汇总账单、未审批草稿" },
    { name: "支出申请", status: "已读取", latestRecordAt: latest(expenses), note: "工资、物流等关联单据去重后计算；未设到期日保留待排期" },
    { name: "其他应收", status: "已放款 / 未结", latestRecordAt: latest(receivables), note: "不等于平台应收结算款" },
    { name: "工资单", status: "已审批 / 已付款", latestRecordAt: latest([...payroll, ...currentPayroll]), note: "按月成本与未付实发分开；不输出员工银行卡、个人薪酬明细" },
  );
  return { version: 1, generatedAt: new Date().toISOString(), readStartedAt, period: { startDate: start, endDate: end, cashTimeZone: "Asia/Shanghai", orderDateBasis: "店铺目的国业务日（沿用原模块）" }, scope: "当前系统数据库 / 全部业务主体 / 管理分析试行版", warnings: [...new Set(warnings)], rates: [...new Set(["CNY", ...rawAccounts.map((row) => reportCurrency(row.currency))])].sort().map((currency) => ({ currency, rate: rates[currency] || null, basis: currency === "CNY" ? "本位币" : rates[currency] ? "账户已保存的一致参考汇率；时间与历史适用性未验证" : "未设置或多账户汇率冲突" })), sources, panels };
}
