export type CashFlowSummaryRow = {
  type: string;
  amount: number | string | { toString(): string };
  currency: string | null;
  exchangeRate?: number | string | { toString(): string } | null;
  accountExchangeRate?: number | string | { toString(): string } | null;
};

export type CashFlowCurrencySummary = Record<string, { original: number; rmb: number }>;

export type CashFlowSummary = {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  incomeByCurrency: CashFlowCurrencySummary;
  expenseByCurrency: CashFlowCurrencySummary;
};

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rateToCny(row: CashFlowSummaryRow): number {
  const currency = String(row.currency || "RMB").toUpperCase();
  if (currency === "CNY" || currency === "RMB") return 1;

  const flowRate = number(row.exchangeRate);
  if (flowRate > 0 && flowRate !== 1) return flowRate;

  const accountRate = number(row.accountExchangeRate);
  return accountRate > 0 ? accountRate : 7.25;
}

export function summarizeCashFlows(rows: CashFlowSummaryRow[]): CashFlowSummary {
  const incomeByCurrency: CashFlowCurrencySummary = {};
  const expenseByCurrency: CashFlowCurrencySummary = {};
  let incomeCount = 0;
  let expenseCount = 0;

  for (const row of rows) {
    const type = String(row.type || "").toLowerCase();
    if (type !== "income" && type !== "expense") continue;

    const currency = String(row.currency || "RMB").toUpperCase();
    const amount = number(row.amount);
    const target = type === "income" ? incomeByCurrency : expenseByCurrency;
    if (!target[currency]) target[currency] = { original: 0, rmb: 0 };
    target[currency].original += amount;
    target[currency].rmb += amount * rateToCny(row);

    if (type === "income") incomeCount += 1;
    else expenseCount += 1;
  }

  const totalIncome = Object.values(incomeByCurrency).reduce((sum, value) => sum + value.rmb, 0);
  const totalExpense = Object.values(expenseByCurrency).reduce((sum, value) => sum + value.rmb, 0);

  return {
    totalIncome,
    totalExpense,
    netIncome: totalIncome + totalExpense,
    transactionCount: rows.length,
    incomeCount,
    expenseCount,
    incomeByCurrency,
    expenseByCurrency,
  };
}

