import assert from "node:assert/strict"
import test from "node:test"
import { resolveCartonQty, resolveMoq, selectPolicyRecord, toPolicy, type ReplenishmentPolicyRecord } from "./replenishment-policy"

const base = (overrides: Partial<ReplenishmentPolicyRecord>): ReplenishmentPolicyRecord => ({
  id: "base", shopId: null, variantId: null, salesWindowDays: 30, targetCoverageDays: 45,
  safetyStockDays: 15, supplierLeadTimeDays: null, domesticCollectionDays: 3,
  oceanTransitDays: 15, customsClearanceDays: 5, demandMultiplier: 1,
  moqOverride: null, cartonQtyOverride: null, effectiveFrom: new Date("2026-08-01"), ...overrides,
})

test("selects SKU policy before shop and global policies", () => {
  const records = [base({ id: "global" }), base({ id: "shop", shopId: "shop-1" }), base({ id: "sku", variantId: "sku-1" })]
  assert.equal(selectPolicyRecord(records, "shop-1", "sku-1")?.id, "sku")
  assert.equal(selectPolicyRecord(records, "shop-1", "sku-2")?.id, "shop")
  assert.equal(selectPolicyRecord(records, "shop-2", "sku-2")?.id, "global")
})

test("selects shop plus SKU before an unscoped SKU policy", () => {
  const records = [
    base({ id: "sku", variantId: "sku-1" }),
    base({ id: "shop-sku", shopId: "shop-1", variantId: "sku-1" }),
  ]
  assert.equal(selectPolicyRecord(records, "shop-1", "sku-1")?.id, "shop-sku")
})

test("keeps the established 30 day lead time when no source is maintained", () => {
  assert.equal(toPolicy(null).leadTimeDays, 30)
})

test("builds total lead time from four auditable stages", () => {
  const policy = toPolicy(base({ supplierLeadTimeDays: 12, domesticCollectionDays: 4, oceanTransitDays: 22, customsClearanceDays: 6 }))
  assert.equal(policy.leadTimeDays, 44)
})

test("uses optional MOQ and carton overrides only when maintained", () => {
  assert.equal(resolveMoq(base({ moqOverride: 500 }), 200), 500)
  assert.equal(resolveMoq(base({ moqOverride: null }), 200), 200)
  assert.equal(resolveCartonQty(base({ cartonQtyOverride: 24 }), 12), 24)
  assert.equal(resolveCartonQty(base({ cartonQtyOverride: null }), 12), 12)
})
