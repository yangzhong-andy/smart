import assert from "node:assert/strict"
import test from "node:test"
import { calculateReplenishment } from "./replenishment"

const policy = { salesWindowDays: 30, targetCoverageDays: 45, safetyStockDays: 15, leadTimeDays: 30 }
const today = new Date("2026-08-14T00:00:00Z")

test("weights recent sales and rounds a required order to carton quantity", () => {
  const result = calculateReplenishment({
    sales7: 70, sales14: 112, sales30: 180,
    overseasAvailable: 200, domesticReady: 20, factoryReady: 0, inTransit: 50,
    moq: 100, cartonQty: 24, today,
  }, policy)

  assert.equal(result.forecastDailySales, 8.6)
  assert.equal(result.inventoryPosition, 270)
  assert.equal(result.reorderPoint, 387)
  assert.equal(result.rawSuggestedQty, 504)
  assert.equal(result.suggestedQty, 504)
  assert.equal(result.urgency, "URGENT")
})

test("does not suggest replenishment while inventory remains above reorder point", () => {
  const result = calculateReplenishment({
    sales7: 70, sales14: 140, sales30: 300,
    overseasAvailable: 1000, domesticReady: 0, factoryReady: 0, inTransit: 0,
    today,
  }, policy)
  assert.equal(result.reorderPoint, 450)
  assert.equal(result.suggestedQty, 0)
  assert.equal(result.urgency, "HEALTHY")
})

test("reports no-sales SKUs without inventing demand", () => {
  const result = calculateReplenishment({
    sales7: 0, sales14: 0, sales30: 0,
    overseasAvailable: 10, domesticReady: 5, factoryReady: 0, inTransit: 0,
    today,
  }, policy)
  assert.equal(result.inventoryPosition, 15)
  assert.equal(result.availableDays, null)
  assert.equal(result.suggestedQty, 0)
  assert.equal(result.urgency, "NO_SALES")
})

