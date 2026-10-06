import { normalizeCashFlowExchangeRateToCny } from "./cash-flow-exchange-rate";

type Numeric = number | string | { toString(): string } | null | undefined;

export type RemittanceStore = {
  id: string;
  name: string;
  platform: string;
  country?: string | null;
  currency?: string | null;
  accountId?: string | null;
  accountName?: string | null;
};

export type RemittanceFlow = {
  id: string;
  type: string;
  status?: string | null;
  flowStatus?: string | null;
  category: string;
  date: Date | string;
  amount: Numeric;
  currency: string | null;
  exchangeRate?: Numeric;
  accountId?: string | null;
  storeId?: string | null;
  isReversal?: boolean;
  reversedById?: string | null;
  isReversed?: boolean;
};

export type StoreRemittanceCurrency = {
  currency: string;
  totalIncome: number;
  totalIncomeRMB: number | null;
  periodIncome: number;
  periodIncomeRMB: number | null;
  thisMonthIncome: number;
  thisMonthIncomeRMB: number | null;
  pendingAmount: number;
  pendingAmountRMB: number | null;
  incomeCount: number;
  periodCount: number;
  pendingCount: number;
  trend: Array<{ month: string; displayMonth: string; amount: number; amountRMB: number | null }>;
};

export type StoreRemittanceReportRow = {
  store: RemittanceStore;
  currencies: StoreRemittanceCurrency[];
};

export type StoreRemittanceReport = {
  data: StoreRemittanceReportRow[];
  summary: {
    currencies: StoreRemittanceCurrency[];
    totalCny: number | null;
    periodCny: number | null;
    thisMonthCny: number | null;
    pendingCny: number | null;
  };
  diagnostics: {
    unattributedCount: number;
    unattributedCurrencies: Array<{ currency: string; amount: number; pendingAmount: number; count: number; pendingCount: number }>;
    ambiguousAccountCount: number;
    unknownStoreCount: number;
    unboundAccountCount: number;
    missingExchangeRateCount: number;
    invalidDateCount: number;
    invalidAmountCount: number;
    excludedReversalCount: number;
    unknownStatusCount: number;
  };
  meta: {
    timeZone: "Asia/Shanghai";
    dateBasis: "stored-utc-date";
    currentMonth: string;
    period: { startDate: string | null; endDate: string | null };
    scope: "recorded-remittances";
  };
  generatedAt: string;
};

export type StoreRemittanceOptions = {
  now?: Date;
  startDate?: string | null;
  endDate?: string | null;
  accountLinks?: Array<{ id: string; storeId?: string | null }>;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeCurrency = (value: string | null | undefined) => {
  const currency = String(value || "CNY").trim().toUpperCase();
  return currency === "RMB" ? "CNY" : currency;
};

/** Only explicit remittance categories count; sales, transfers and investments do not. */
export function isStoreRemittanceCategory(value: string): boolean {
  const category = String(value || "").trim();
  return category === "回款" || category.startsWith("回款/") ||
    category === "店铺回款" || category === "平台回款";
}

export function isValidRemittanceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Match the financial ledger's date column, which is serialized as its UTC date. */
function ledgerDate(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function businessDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addCny(current: number | null, amount: number, rate: number | null): number | null {
  return current === null || rate === null ? null : current + amount * rate;
}

function newCurrency(currency: string, months: string[]): StoreRemittanceCurrency {
  return {
    currency, totalIncome: 0, totalIncomeRMB: 0, periodIncome: 0, periodIncomeRMB: 0,
    thisMonthIncome: 0, thisMonthIncomeRMB: 0, pendingAmount: 0, pendingAmountRMB: 0,
    incomeCount: 0, periodCount: 0, pendingCount: 0,
    trend: months.map((month) => ({ month, displayMonth: `${Number(month.slice(5))}月`, amount: 0, amountRMB: 0 })),
  };
}

function accumulate(
  bucket: StoreRemittanceCurrency,
  amount: number,
  rate: number | null,
  date: string,
  status: string,
  inPeriod: boolean,
  currentMonth: string,
) {
  if (status === "pending") {
    // Pending is a financial record awaiting confirmation, not a platform settlement balance.
    bucket.pendingAmount += amount;
    bucket.pendingAmountRMB = addCny(bucket.pendingAmountRMB, amount, rate);
    bucket.pendingCount += 1;
    return;
  }
  bucket.totalIncome += amount;
  bucket.totalIncomeRMB = addCny(bucket.totalIncomeRMB, amount, rate);
  bucket.incomeCount += 1;
  if (inPeriod) {
    bucket.periodIncome += amount;
    bucket.periodIncomeRMB = addCny(bucket.periodIncomeRMB, amount, rate);
    bucket.periodCount += 1;
  }
  const month = date.slice(0, 7);
  if (month === currentMonth) {
    bucket.thisMonthIncome += amount;
    bucket.thisMonthIncomeRMB = addCny(bucket.thisMonthIncomeRMB, amount, rate);
  }
  const trend = bucket.trend.find((point) => point.month === month);
  if (trend) {
    trend.amount += amount;
    trend.amountRMB = addCny(trend.amountRMB, amount, rate);
  }
}

function finishCurrency(value: StoreRemittanceCurrency): StoreRemittanceCurrency {
  const roundNullable = (number: number | null) => number === null ? null : round(number);
  return {
    ...value,
    totalIncome: round(value.totalIncome), totalIncomeRMB: roundNullable(value.totalIncomeRMB),
    periodIncome: round(value.periodIncome), periodIncomeRMB: roundNullable(value.periodIncomeRMB),
    thisMonthIncome: round(value.thisMonthIncome), thisMonthIncomeRMB: roundNullable(value.thisMonthIncomeRMB),
    pendingAmount: round(value.pendingAmount), pendingAmountRMB: roundNullable(value.pendingAmountRMB),
    trend: value.trend.map((point) => ({ ...point, amount: round(point.amount), amountRMB: roundNullable(point.amountRMB) })),
  };
}

/** Pure aggregation of the complete lightweight financial ledger, without pagination or vouchers. */
export function buildStoreRemittanceReport(
  stores: RemittanceStore[],
  flows: RemittanceFlow[],
  options: StoreRemittanceOptions = {},
): StoreRemittanceReport {
  const now = options.now ?? new Date();
  const startDate = options.startDate || null;
  const endDate = options.endDate || null;
  if ((startDate && !isValidRemittanceDate(startDate)) || (endDate && !isValidRemittanceDate(endDate))) {
    throw new Error("日期格式无效，请使用有效的 YYYY-MM-DD 日期");
  }
  if (startDate && endDate && startDate > endDate) throw new Error("开始日期不能晚于结束日期");

  const currentMonth = businessDate(now).slice(0, 7);
  const [year, month] = currentMonth.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, index) =>
    new Date(Date.UTC(year, month - 6 + index, 1)).toISOString().slice(0, 7));
  const storeMap = new Map(stores.map((store) => [store.id, store]));
  const accountOwners = new Map<string, Set<string>>();
  const addAccountOwner = (accountId: string | null | undefined, storeId: string | null | undefined) => {
    if (!accountId || !storeId) return;
    const owners = accountOwners.get(accountId) ?? new Set<string>();
    owners.add(storeId);
    accountOwners.set(accountId, owners);
  };
  stores.forEach((store) => addAccountOwner(store.accountId, store.id));
  (options.accountLinks ?? []).forEach((account) => addAccountOwner(account.id, account.storeId));

  // In this schema the reversal's reversedById points to the original, not vice versa.
  const reversedIds = new Set(flows.filter((flow) => flow.isReversal && flow.reversedById).map((flow) => flow.reversedById));
  const perStore = new Map(stores.map((store) => [store.id, new Map<string, StoreRemittanceCurrency>()]));
  const summaryCurrencies = new Map<string, StoreRemittanceCurrency>();
  const unattributed = new Map<string, StoreRemittanceReport["diagnostics"]["unattributedCurrencies"][number]>();
  const diagnostics: StoreRemittanceReport["diagnostics"] = {
    unattributedCount: 0, unattributedCurrencies: [], ambiguousAccountCount: 0,
    unknownStoreCount: 0, unboundAccountCount: 0, missingExchangeRateCount: 0,
    invalidDateCount: 0, invalidAmountCount: 0, excludedReversalCount: 0, unknownStatusCount: 0,
  };

  for (const flow of flows) {
    if (String(flow.type).toLowerCase() !== "income" || !isStoreRemittanceCategory(flow.category)) continue;
    if (flow.isReversal || flow.isReversed || reversedIds.has(flow.id)) {
      diagnostics.excludedReversalCount += 1;
      continue;
    }
    const status = String(flow.status ?? flow.flowStatus ?? "").toLowerCase();
    if (status !== "confirmed" && status !== "pending") {
      diagnostics.unknownStatusCount += 1;
      continue;
    }
    const date = ledgerDate(flow.date);
    if (!date) {
      diagnostics.invalidDateCount += 1;
      continue;
    }
    const amount = Number(flow.amount);
    // Negative, unlinked corrections must not be silently converted into positive income.
    if (!Number.isFinite(amount) || amount < 0 || flow.amount == null) {
      diagnostics.invalidAmountCount += 1;
      continue;
    }
    const currency = normalizeCurrency(flow.currency);
    const rate = normalizeCashFlowExchangeRateToCny(currency, flow.exchangeRate);
    if (rate === null) diagnostics.missingExchangeRateCount += 1;
    const inPeriod = (!startDate || date >= startDate) && (!endDate || date <= endDate);

    let owner: string | undefined;
    const explicitStoreId = String(flow.storeId || "").trim();
    if (explicitStoreId) {
      if (storeMap.has(explicitStoreId)) owner = explicitStoreId;
      else diagnostics.unknownStoreCount += 1;
    } else {
      const candidates = accountOwners.get(flow.accountId || "");
      if (candidates?.size === 1) {
        const candidate = Array.from(candidates)[0];
        if (storeMap.has(candidate)) owner = candidate;
        else diagnostics.unknownStoreCount += 1;
      } else if (candidates && candidates.size > 1) diagnostics.ambiguousAccountCount += 1;
      else diagnostics.unboundAccountCount += 1;
    }

    if (!owner) {
      diagnostics.unattributedCount += 1;
      const bucket = unattributed.get(currency) ?? { currency, amount: 0, pendingAmount: 0, count: 0, pendingCount: 0 };
      if (status === "confirmed") { bucket.amount += amount; bucket.count += 1; }
      else { bucket.pendingAmount += amount; bucket.pendingCount += 1; }
      unattributed.set(currency, bucket);
      continue;
    }

    const buckets = perStore.get(owner)!;
    const bucket = buckets.get(currency) ?? newCurrency(currency, months);
    const summaryBucket = summaryCurrencies.get(currency) ?? newCurrency(currency, months);
    accumulate(bucket, amount, rate, date, status, inPeriod, currentMonth);
    accumulate(summaryBucket, amount, rate, date, status, inPeriod, currentMonth);
    buckets.set(currency, bucket);
    summaryCurrencies.set(currency, summaryBucket);
  }

  const data = stores.map((store) => {
    const buckets = perStore.get(store.id)!;
    if (!buckets.size) buckets.set(normalizeCurrency(store.currency), newCurrency(normalizeCurrency(store.currency), months));
    return { store, currencies: Array.from(buckets.values()).sort((a, b) => a.currency.localeCompare(b.currency)).map(finishCurrency) };
  });
  const currencyValues = Array.from(summaryCurrencies.values());
  const sumCny = (field: "totalIncomeRMB" | "periodIncomeRMB" | "thisMonthIncomeRMB" | "pendingAmountRMB") => {
    if (currencyValues.some((entry) => entry[field] === null)) return null;
    return round(currencyValues.reduce((sum, entry) => sum + (entry[field] ?? 0), 0));
  };
  diagnostics.unattributedCurrencies = Array.from(unattributed.values())
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((entry) => ({ ...entry, amount: round(entry.amount), pendingAmount: round(entry.pendingAmount) }));
  return {
    data,
    summary: {
      currencies: currencyValues.sort((a, b) => a.currency.localeCompare(b.currency)).map(finishCurrency),
      totalCny: sumCny("totalIncomeRMB"), periodCny: sumCny("periodIncomeRMB"),
      thisMonthCny: sumCny("thisMonthIncomeRMB"), pendingCny: sumCny("pendingAmountRMB"),
    },
    diagnostics,
    meta: { timeZone: "Asia/Shanghai", dateBasis: "stored-utc-date", currentMonth, period: { startDate, endDate }, scope: "recorded-remittances" },
    generatedAt: now.toISOString(),
  };
}
