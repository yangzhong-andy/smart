/** Management reporting contract v1. No statutory accounting or implicit FX. */
export const COMPANY_REPORTS = [
  { id: "overview", title: "公司经营总览", description: "经营、资金、资产与数据风险，一屏看清" },
  { id: "profit", title: "公司利润表", description: "订单贡献 → 已识别公司费用，不把回款重复计为销售" },
  { id: "stores", title: "店铺经营表", description: "按平台与店铺比较销售、成本、贡献和核算完整度" },
  { id: "cash", title: "资金收支表", description: "已确认实收实付，内部划拨单独列示" },
  { id: "position", title: "资产负债管理表", description: "当前账面资金、货物估值、应收与已识别待付" },
  { id: "forecast", title: "未来资金计划", description: "按原币查看未来 30 / 60 / 90 天的已知收付款" },
] as const;
export type CompanyReportId = typeof COMPANY_REPORTS[number]["id"];
export type ReportCell = string | number | null;
export type ReportTable = {
  title: string;
  columns: Array<{ key: string; label: string; format?: "money" | "number" | "percent" }>;
  rows: Array<Record<string, ReportCell>>;
  href?: string;
  note?: string;
};
export type ReportPanel = {
  metrics: Array<{ label: string; value: number | null; unit?: string; note: string }>;
  tables: ReportTable[];
  notes: string[];
};
export type CompanyReportResponse = {
  version: 1;
  generatedAt: string;
  readStartedAt: string;
  period: { startDate: string; endDate: string; cashTimeZone: string; orderDateBasis: string };
  scope: string;
  warnings: string[];
  rates: Array<{ currency: string; rate: number | null; basis: string }>;
  sources: Array<{ name: string; status: string; latestRecordAt: string | null; note: string }>;
  panels: Record<CompanyReportId, ReportPanel>;
};

export const roundReportMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const reportCurrency = (value: string) => value.trim().toUpperCase() === "RMB" ? "CNY" : value.trim().toUpperCase();

export function canReadCompanyReports(user: { role: string; departmentCode?: string | null }) {
  return ["SUPER_ADMIN", "ADMIN"].includes(user.role) || user.departmentCode === "FINANCE_CENTER";
}

export function validateReportPeriod(start: string, end: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end) || start > end) throw new Error("请选择有效的起止日期");
  if ((Date.parse(end) - Date.parse(start)) / 86400000 >= 93) throw new Error("单次最多查询 93 天，请按月或季度查询");
}

export function isInternalMovement(type: string, category: string) {
  return type === "TRANSFER" || /内部划拨|内部转账|账户互转|内部转款|换汇|结汇/.test(category);
}

/** Account rates are valuation references, not historical/closing FX rates.
 * Conflicting saved rates cannot be silently averaged. */
export function savedReportRates(accounts: Array<{ currency: string; exchangeRate: number }>) {
  const candidates = new Map<string, Set<number>>();
  for (const account of accounts) {
    const code = reportCurrency(account.currency);
    const values = candidates.get(code) || new Set<number>();
    if (Number.isFinite(account.exchangeRate) && account.exchangeRate > 0) values.add(account.exchangeRate);
    candidates.set(code, values);
  }
  const rates: Record<string, number> = { CNY: 1, RMB: 1 };
  for (const [code, values] of candidates) if (code !== "CNY" && values.size === 1) rates[code] = [...values][0];
  return rates;
}

export function reportCny(amount: number, currency: string, rates: Record<string, number>): number | null {
  if (!Number.isFinite(amount)) return null;
  if (amount === 0) return 0;
  const rate = rates[reportCurrency(currency)];
  return rate && rate > 0 ? roundReportMoney(amount * rate) : null;
}

export function completeSum(values: Array<number | null>): number | null {
  return values.some((value) => value == null) ? null : roundReportMoney(values.reduce<number>((sum, value) => sum + value!, 0));
}

export type PlannedMovement = {
  id: string; label: string; currency: string; amount: number;
  dueDate: string | null; direction: "IN" | "OUT"; source: string; href: string;
};

export function forecastByCurrency(opening: Record<string, number | null>, movements: PlannedMovement[], today: string, unknownPayableCurrencies = new Set<string>()) {
  const currencies = [...new Set([...Object.keys(opening), ...movements.map((row) => row.currency)])].sort();
  return currencies.flatMap((currency) => [30, 60, 90].map((days) => {
    const deadline = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    // Overdue unpaid items are immediate commitments, not silently dropped.
    const scheduled = movements.filter((row) => row.currency === currency && row.dueDate && row.dueDate <= deadline);
    const incoming = scheduled.filter((row) => row.direction === "IN").reduce((sum, row) => sum + row.amount, 0);
    const outgoing = scheduled.filter((row) => row.direction === "OUT").reduce((sum, row) => sum + row.amount, 0);
    const undatedOut = movements.filter((row) => row.currency === currency && !row.dueDate && row.direction === "OUT").reduce((sum, row) => sum + row.amount, 0);
    const balance = opening[currency] === null ? null : roundReportMoney(opening[currency] || 0);
    const incomplete = unknownPayableCurrencies.has(currency);
    return {
      currency, days, deadline, opening: balance,
      incoming: roundReportMoney(incoming), outgoing: incomplete ? null : roundReportMoney(outgoing),
      closing: balance == null || incomplete ? null : roundReportMoney(balance + incoming - outgoing),
      undatedOut: roundReportMoney(undatedOut),
      conservative: balance == null || incomplete ? null : roundReportMoney(balance + incoming - outgoing - undatedOut),
    };
  }));
}

/** Logistics costs point to batch expense requests, not necessarily relatedId.
 * Prefer approved monthly bills, subtract only proven overlapping source costs.
 * A mismatch must remain unknown rather than guessed or double counted. */
export function remainingLogisticsRequest(amount: number, currency: string, links: Array<{ id: string; amount: number; currency: string; cashFlowId?: string | null }>, billedCostIds: Set<string>): number | null {
  const overlap = links.filter((row) => billedCostIds.has(row.id));
  if (!overlap.length) return amount;
  if (links.some((row) => reportCurrency(row.currency) !== reportCurrency(currency) || row.cashFlowId)
    || Math.abs(links.reduce((sum, row) => sum + row.amount, 0) - amount) > 0.005) return null;
  return roundReportMoney(Math.max(0, amount - overlap.reduce((sum, row) => sum + row.amount, 0)));
}

export function sumOriginal(rows: Array<{ currency: string; amount: number }>) {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const code = reportCurrency(row.currency);
    totals[code] = roundReportMoney((totals[code] || 0) + row.amount);
  }
  return totals;
}

export function reportCsvCell(value: ReportCell) {
  const text = value == null ? "待核实" : String(value);
  // Exported descriptions/SKUs may be user-entered. Never let spreadsheet
  // programs interpret a string as a formula, even after leading whitespace.
  const safe = /^[\s\uFEFF]*[=+@-]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
