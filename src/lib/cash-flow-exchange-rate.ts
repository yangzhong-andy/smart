function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Preserve the payment-day CNY rate on a cash-flow row. */
export function normalizeCashFlowExchangeRateToCny(
  flowCurrency: string | null | undefined,
  exchangeRate: unknown,
): number | null {
  const code = String(flowCurrency || "CNY").trim().toUpperCase();
  if (code === "CNY" || code === "RMB") return 1;
  return positiveNumber(exchangeRate);
}

/** Resolve 1 unit of the source currency to CNY. */
export function resolveCashFlowExchangeRateToCny(
  currency: string | null | undefined,
  cnyBaseRates?: unknown,
  accountExchangeRate?: unknown,
): number | null {
  const code = String(currency || "CNY").trim().toUpperCase();
  if (code === "CNY" || code === "RMB") return 1;

  // The exchange-rate service returns 1 CNY = X units of foreign currency.
  const quotes = cnyBaseRates && typeof cnyBaseRates === "object"
    ? cnyBaseRates as Record<string, unknown>
    : null;
  const cnyToForeign = positiveNumber(quotes?.[code]);
  if (cnyToForeign) return 1 / cnyToForeign;

  return positiveNumber(accountExchangeRate);
}
