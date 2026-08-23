import { COUNTRIES } from "@/lib/country-config";

export const TIKTOK_REGION_SOURCES = ["TIKTOK", "MANUAL", "LEGACY", "PENDING"] as const;
export type TikTokRegionSource = (typeof TIKTOK_REGION_SOURCES)[number];
export type TikTokCountryStatus = "VERIFIED" | "REVIEW" | "PENDING" | "CONFLICT";

const REGION_ALIASES: Record<string, string> = {
  BRA: "BR",
  BRAZIL: "BR",
  USA: "US",
  "UNITED STATES": "US",
  GB: "UK",
  GBR: "UK",
};

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]));

/**
 * Extract an explicit TikTok market/region from the authorization response.
 * TikTok has used several field names across API versions; only values that
 * resolve to a known ISO-like country code are accepted. We deliberately do
 * not infer a country from currency alone.
 */
export function extractTikTokRegion(shop: unknown): string | null {
  if (!shop || typeof shop !== "object") return null;
  const record = shop as Record<string, unknown>;
  const candidates = [
    record.region,
    record.country,
    record.country_code,
    record.countryCode,
    record.market,
    record.market_code,
    record.marketCode,
    record.site,
    record.site_code,
    record.siteCode,
    record.marketplace,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeTikTokRegion(candidate);
    if (normalized && COUNTRY_BY_CODE.has(normalized)) return normalized;
    if (candidate && typeof candidate === "object") {
      const nested = extractTikTokRegion(candidate);
      if (nested) return nested;
    }
  }
  return null;
}

export function normalizeTikTokRegion(value: unknown): string | null {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw === "UNSET" || raw === "UNKNOWN" || raw === "N/A") return null;
  const normalized = REGION_ALIASES[raw] || raw;
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

export function expectedCurrencyForRegion(region: unknown): string | null {
  const normalized = normalizeTikTokRegion(region);
  return normalized ? COUNTRY_BY_CODE.get(normalized)?.currency || null : null;
}

export function countryNameForRegion(region: unknown): string | null {
  const normalized = normalizeTikTokRegion(region);
  return normalized ? COUNTRY_BY_CODE.get(normalized)?.name || normalized : null;
}

export function evaluateTikTokCountryIdentity(input: {
  region: unknown;
  regionSource: unknown;
  observedCurrencies?: Iterable<string | null | undefined>;
}): {
  status: TikTokCountryStatus;
  region: string | null;
  countryName: string | null;
  expectedCurrency: string | null;
  observedCurrencies: string[];
} {
  const region = normalizeTikTokRegion(input.region);
  const expectedCurrency = expectedCurrencyForRegion(region);
  const observedCurrencies = Array.from(new Set(
    Array.from(input.observedCurrencies || [])
      .map((currency) => String(currency || "").trim().toUpperCase())
      .filter(Boolean),
  )).sort();

  let status: TikTokCountryStatus;
  if (!region || !expectedCurrency) {
    status = "PENDING";
  } else if (observedCurrencies.some((currency) => currency !== expectedCurrency)) {
    status = "CONFLICT";
  } else if (String(input.regionSource || "").toUpperCase() === "LEGACY") {
    status = "REVIEW";
  } else {
    status = "VERIFIED";
  }

  return {
    status,
    region,
    countryName: countryNameForRegion(region),
    expectedCurrency,
    observedCurrencies,
  };
}
