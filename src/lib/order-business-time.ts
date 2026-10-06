import { defaultTimeZone, normalizeCountryCode } from "@/lib/profit-schemes";

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function orderTimeZone(countryCode: string | null | undefined): string {
  return defaultTimeZone(normalizeCountryCode(countryCode));
}

export function businessDateInTimeZone(date: Date, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function orderBusinessDate(date: Date, countryCode: string | null | undefined): string {
  return businessDateInTimeZone(date, orderTimeZone(countryCode));
}

export function isBusinessDate(value: string | null | undefined): value is string {
  if (!value || !BUSINESS_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addBusinessDays(value: string, days: number): string {
  if (!isBusinessDate(value)) throw new Error("Invalid business date");
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function relativeBusinessDate(
  countryCode: string | null | undefined,
  dayOffset = 0,
  now = new Date(),
): string {
  return addBusinessDays(orderBusinessDate(now, countryCode), dayOffset);
}

function timeZoneOffsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const displayedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return displayedAsUtc - instant.getTime();
}

export function startOfBusinessDate(value: string, timeZone: string): Date {
  if (!isBusinessDate(value)) throw new Error("Invalid business date");
  const [year, month, day] = value.split("-").map(Number);
  const localMidnightAsUtc = new Date(Date.UTC(year, month - 1, day));

  // Resolve the offset twice so midnight remains correct when DST changes.
  let instant = new Date(localMidnightAsUtc.getTime() - timeZoneOffsetAt(localMidnightAsUtc, timeZone));
  instant = new Date(localMidnightAsUtc.getTime() - timeZoneOffsetAt(instant, timeZone));
  return instant;
}

export function businessDateUtcRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  countryCode: string | null | undefined,
): { gte?: Date; lt?: Date } {
  return businessDateUtcRangeInTimeZone(startDate, endDate, orderTimeZone(countryCode));
}

export function businessDateUtcRangeInTimeZone(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  timeZone: string,
): { gte?: Date; lt?: Date } {
  return {
    ...(startDate ? { gte: startOfBusinessDate(startDate, timeZone) } : {}),
    ...(endDate ? { lt: startOfBusinessDate(addBusinessDays(endDate, 1), timeZone) } : {}),
  };
}

export function formatOrderDateTime(
  value: string | Date | null | undefined,
  countryCode: string | null | undefined,
  locale = "zh-CN",
): string {
  if (!value) return "--";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString(locale, {
    hour12: false,
    timeZone: orderTimeZone(countryCode),
  });
}
