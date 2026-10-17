import { AsyncLocalStorage } from "node:async_hooks";

// Internal calculation context, never controlled by query strings. Reports must
// not refresh OAuth tokens, call platform APIs, or write business records.
const shared = globalThis as typeof globalThis & { __financeReportContext?: AsyncLocalStorage<{ rates: Record<string, number> }> };
const context = shared.__financeReportContext ||= new AsyncLocalStorage<{ rates: Record<string, number> }>();
export const financeReportContext = () => context.getStore();
export function withFinanceReportContext<T>(rates: Record<string, number>, work: () => Promise<T>) {
  return context.run({ rates }, work);
}
