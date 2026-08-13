export type ReplenishmentPolicy = {
  salesWindowDays: number
  targetCoverageDays: number
  safetyStockDays: number
  leadTimeDays: number
  supplierLeadTimeDays?: number
  domesticCollectionDays?: number
  oceanTransitDays?: number
  customsClearanceDays?: number
  demandMultiplier?: number
}

export type ReplenishmentInput = {
  sales7: number
  sales14: number
  sales30: number
  overseasAvailable: number
  domesticReady: number
  factoryReady: number
  inTransit: number
  moq?: number | null
  cartonQty?: number | null
  today: Date
}

export type ReplenishmentResult = {
  averageDailySales: number
  forecastDailySales: number
  inventoryPosition: number
  availableDays: number | null
  stockoutDate: string | null
  reorderPoint: number
  suggestedOrderDate: string | null
  rawSuggestedQty: number
  suggestedQty: number
  urgency: "OUT_OF_STOCK" | "URGENT" | "WATCH" | "HEALTHY" | "NO_SALES"
}

const DAY_MS = 24 * 60 * 60 * 1000

function day(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function addDays(value: Date, days: number): Date {
  return new Date(day(value).getTime() + Math.max(0, Math.floor(days)) * DAY_MS)
}

function positive(value: number | null | undefined): number {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
}

export function selectReplenishmentUnitCost(
  variantCost: unknown,
  supplierPrice: unknown,
): number {
  const variant = Number(variantCost ?? 0)
  const supplier = Number(supplierPrice ?? 0)
  if (Number.isFinite(variant) && variant > 0) return variant
  return Number.isFinite(supplier) && supplier > 0 ? supplier : 0
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function normalizeReplenishmentQuantity(value: number, moq: number, cartonQty: number): number {
  if (value <= 0) return 0
  const minimum = Math.max(1, Math.ceil(moq || 1))
  const pack = Math.max(1, Math.ceil(cartonQty || 1))
  return Math.ceil(Math.max(value, minimum) / pack) * pack
}

/**
 * Sales are weighted toward the latest seven days while retaining enough
 * history to avoid overreacting to one short spike.
 */
export function calculateReplenishment(
  input: ReplenishmentInput,
  policy: ReplenishmentPolicy,
): ReplenishmentResult {
  const sales7 = positive(input.sales7)
  const sales14 = positive(input.sales14)
  const sales30 = positive(input.sales30)
  const averageDailySales = policy.salesWindowDays <= 7
    ? sales7 / 7
    : policy.salesWindowDays <= 14 ? sales14 / 14 : sales30 / 30
  const forecastDailySales = round(round(
    policy.salesWindowDays <= 7
      ? sales7 / 7
      : policy.salesWindowDays <= 14
        ? (sales7 / 7) * 0.65 + (sales14 / 14) * 0.35
        : (sales7 / 7) * 0.5 + (sales14 / 14) * 0.3 + (sales30 / 30) * 0.2,
    4,
  ) * Math.max(0.1, Number(policy.demandMultiplier ?? 1)), 4)
  const overseasAvailable = positive(input.overseasAvailable)
  const inventoryPosition = Math.floor(
    overseasAvailable
    + positive(input.domesticReady)
    + positive(input.factoryReady)
    + positive(input.inTransit),
  )

  if (forecastDailySales <= 0) {
    return {
      averageDailySales: round(averageDailySales, 4),
      forecastDailySales: 0,
      inventoryPosition,
      availableDays: null,
      stockoutDate: null,
      reorderPoint: 0,
      suggestedOrderDate: null,
      rawSuggestedQty: 0,
      suggestedQty: 0,
      urgency: "NO_SALES",
    }
  }

  const availableDays = round(overseasAvailable / forecastDailySales, 1)
  const stockoutDate = isoDate(addDays(input.today, Math.floor(availableDays)))
  const reorderPoint = Math.ceil(forecastDailySales * (policy.leadTimeDays + policy.safetyStockDays))
  const targetPosition = Math.ceil(
    forecastDailySales * (policy.leadTimeDays + policy.safetyStockDays + policy.targetCoverageDays),
  )
  const rawSuggestedQty = Math.max(0, targetPosition - inventoryPosition)
  const suggestedQty = inventoryPosition <= reorderPoint
    ? normalizeReplenishmentQuantity(rawSuggestedQty, positive(input.moq), positive(input.cartonQty))
    : 0
  const orderInDays = Math.floor(availableDays - policy.leadTimeDays - policy.safetyStockDays)
  const suggestedOrderDate = isoDate(addDays(input.today, orderInDays))
  const urgency = overseasAvailable <= 0
    ? "OUT_OF_STOCK"
    : orderInDays <= 0 ? "URGENT"
      : orderInDays <= 14 ? "WATCH" : "HEALTHY"

  return {
    averageDailySales: round(averageDailySales, 4),
    forecastDailySales,
    inventoryPosition,
    availableDays,
    stockoutDate,
    reorderPoint,
    suggestedOrderDate,
    rawSuggestedQty,
    suggestedQty,
    urgency,
  }
}
