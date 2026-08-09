export type EffectiveProfitScheme = {
  id: string;
  storeId: string;
  version: number;
  status: string;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
};

export type ProfitSchemeResolution =
  | { status: "matched"; scheme: EffectiveProfitScheme }
  | { status: "missing_scheme"; scheme: null }
  | { status: "overlapping_schemes"; scheme: null; schemeIds: string[] };

function dateKey(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function selectActiveProfitScheme(
  schemes: EffectiveProfitScheme[],
  storeId: string,
  businessDate: string,
): ProfitSchemeResolution {
  const candidates = schemes.filter((scheme) => (
    scheme.storeId === storeId
    && ["PUBLISHED", "ARCHIVED"].includes(scheme.status)
    && dateKey(scheme.effectiveFrom) <= businessDate
    && (!scheme.effectiveTo || dateKey(scheme.effectiveTo) >= businessDate)
  ));
  if (candidates.length === 0) return { status: "missing_scheme", scheme: null };
  if (candidates.length > 1) {
    return {
      status: "overlapping_schemes",
      scheme: null,
      schemeIds: candidates.map((scheme) => scheme.id).sort(),
    };
  }
  return { status: "matched", scheme: candidates[0] };
}

export function dateRangesOverlap(
  left: { effectiveFrom: Date | string; effectiveTo: Date | string | null },
  right: { effectiveFrom: Date | string; effectiveTo: Date | string | null },
): boolean {
  const leftStart = dateKey(left.effectiveFrom);
  const leftEnd = left.effectiveTo ? dateKey(left.effectiveTo) : "9999-12-31";
  const rightStart = dateKey(right.effectiveFrom);
  const rightEnd = right.effectiveTo ? dateKey(right.effectiveTo) : "9999-12-31";
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function dayBefore(value: Date | string): Date {
  const date = new Date(`${dateKey(value)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}
