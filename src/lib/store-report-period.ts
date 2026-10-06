export type StoreReportQuickPeriod = "" | "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "lastYear";
export type StoreReportPeriodInput = {
  quick: StoreReportQuickPeriod;
  year: string;
  month: string;
  startDate: string;
  endDate: string;
};

/** Calendar controls use Shanghai's today; ledger dates remain the existing UTC date keys. */
export function shanghaiToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return [part("year"), part("month"), part("day")].join("-");
}

const key = (date: Date) => date.toISOString().slice(0, 10);
const calendar = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

export function resolveStoreReportPeriod(input: StoreReportPeriodInput, now = new Date()): { startDate: string; endDate: string } {
  const today = shanghaiToday(now);
  const date = new Date(today + "T00:00:00.000Z");
  const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate();
  const offset = (days: number) => key(calendar(year, month, day + days));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  switch (input.quick) {
    case "today": return { startDate: today, endDate: today };
    case "yesterday": return { startDate: offset(-1), endDate: offset(-1) };
    case "thisWeek": return { startDate: offset(-mondayOffset), endDate: today };
    case "lastWeek": return { startDate: offset(-mondayOffset - 7), endDate: offset(-mondayOffset - 1) };
    case "thisMonth": return { startDate: key(calendar(year, month, 1)), endDate: today };
    case "lastMonth": return { startDate: key(calendar(year, month - 1, 1)), endDate: key(calendar(year, month, 0)) };
    case "thisQuarter": return { startDate: key(calendar(year, Math.floor(month / 3) * 3, 1)), endDate: today };
    case "thisYear": return { startDate: key(calendar(year, 0, 1)), endDate: today };
    case "lastYear": return { startDate: key(calendar(year - 1, 0, 1)), endDate: key(calendar(year - 1, 11, 31)) };
  }
  if (input.month && /^\d{4}-\d{2}$/.test(input.month)) {
    const [y, m] = input.month.split("-").map(Number);
    return { startDate: key(calendar(y, m - 1, 1)), endDate: key(calendar(y, m, 0)) };
  }
  if (input.year && /^\d{4}$/.test(input.year)) return { startDate: input.year + "-01-01", endDate: input.year + "-12-31" };
  return { startDate: input.startDate, endDate: input.endDate };
}
