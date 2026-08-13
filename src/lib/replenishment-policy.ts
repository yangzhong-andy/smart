import type { ReplenishmentPolicy } from "./replenishment"

export type ReplenishmentPolicyRecord = {
  id: string
  shopId: string | null
  variantId: string | null
  salesWindowDays: number
  targetCoverageDays: number
  safetyStockDays: number
  supplierLeadTimeDays: number | null
  domesticCollectionDays: number
  oceanTransitDays: number
  customsClearanceDays: number
  demandMultiplier: unknown
  moqOverride: number | null
  cartonQtyOverride: number | null
  effectiveFrom: Date
}

export const DEFAULT_REPLENISHMENT_POLICY: ReplenishmentPolicy = {
  salesWindowDays: 30,
  targetCoverageDays: 45,
  safetyStockDays: 15,
  leadTimeDays: 30,
  supplierLeadTimeDays: 30,
  domesticCollectionDays: 0,
  oceanTransitDays: 0,
  customsClearanceDays: 0,
  demandMultiplier: 1,
}

export function toPolicy(record: ReplenishmentPolicyRecord | null, supplierLeadTimeDays = 30): ReplenishmentPolicy {
  const supplierDays = record?.supplierLeadTimeDays ?? supplierLeadTimeDays
  const domesticDays = record?.domesticCollectionDays ?? DEFAULT_REPLENISHMENT_POLICY.domesticCollectionDays!
  const oceanDays = record?.oceanTransitDays ?? DEFAULT_REPLENISHMENT_POLICY.oceanTransitDays!
  const customsDays = record?.customsClearanceDays ?? DEFAULT_REPLENISHMENT_POLICY.customsClearanceDays!
  return {
    salesWindowDays: record?.salesWindowDays ?? DEFAULT_REPLENISHMENT_POLICY.salesWindowDays,
    targetCoverageDays: record?.targetCoverageDays ?? DEFAULT_REPLENISHMENT_POLICY.targetCoverageDays,
    safetyStockDays: record?.safetyStockDays ?? DEFAULT_REPLENISHMENT_POLICY.safetyStockDays,
    supplierLeadTimeDays: supplierDays,
    domesticCollectionDays: domesticDays,
    oceanTransitDays: oceanDays,
    customsClearanceDays: customsDays,
    leadTimeDays: supplierDays + domesticDays + oceanDays + customsDays,
    demandMultiplier: Number(record?.demandMultiplier ?? 1),
  }
}

export function selectPolicyRecord(
  records: ReplenishmentPolicyRecord[],
  shopId: string | null,
  variantId: string,
): ReplenishmentPolicyRecord | null {
  const candidates = records.filter((record) =>
    (record.variantId == null || record.variantId === variantId)
    && (record.shopId == null || record.shopId === shopId),
  )
  return candidates.sort((left, right) => {
    const specificity = (value: ReplenishmentPolicyRecord) => (value.variantId ? 2 : 0) + (value.shopId ? 1 : 0)
    return specificity(right) - specificity(left)
      || right.effectiveFrom.getTime() - left.effectiveFrom.getTime()
  })[0] ?? null
}

export function resolveMoq(record: ReplenishmentPolicyRecord | null, productMoq: number | null | undefined) {
  return record?.moqOverride ?? productMoq ?? null
}

export function resolveCartonQty(record: ReplenishmentPolicyRecord | null, defaultCartonQty: number | null | undefined) {
  return record?.cartonQtyOverride ?? defaultCartonQty ?? null
}
