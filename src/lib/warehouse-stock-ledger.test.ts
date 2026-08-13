import assert from "node:assert/strict"
import test from "node:test"
import { calculateWarehouseStockLedger, LEDGER_CALIBRATION_TYPE } from "./warehouse-stock-ledger"

const at = (value: string) => new Date(value)

test("uses the first movement balance as the audited system baseline", () => {
  const ledger = calculateWarehouseStockLedger([
    { reason: "SALE_OUTBOUND", movementType: "DOMESTIC_OUTBOUND", qty: -3, qtyBefore: 2464, qtyAfter: 2461, operationDate: at("2026-07-27T04:00:00Z"), createdAt: at("2026-07-27T04:00:00Z") },
    { reason: "SALE_OUTBOUND", movementType: "DOMESTIC_OUTBOUND", qty: -1, qtyBefore: 2461, qtyAfter: 2460, operationDate: at("2026-07-27T04:01:00Z"), createdAt: at("2026-07-27T04:01:00Z") },
  ], 2460)
  assert.equal(ledger.openingQty, 2464)
  assert.equal(ledger.effectiveOutbound, 4)
  assert.equal(ledger.expectedQty, 2460)
})

test("subtracts cancelled-order returns from effective outbound", () => {
  const ledger = calculateWarehouseStockLedger([
    { reason: "SALE_OUTBOUND", movementType: "DOMESTIC_OUTBOUND", qty: -2, qtyBefore: 10, qtyAfter: 8, operationDate: at("2026-07-27T04:00:00Z"), createdAt: at("2026-07-27T04:00:00Z") },
    { reason: "RETURN_INBOUND", movementType: "ADJUSTMENT", qty: 1, qtyBefore: 8, qtyAfter: 9, operationDate: at("2026-07-28T04:00:00Z"), createdAt: at("2026-07-28T04:00:00Z") },
  ], 9)
  assert.equal(ledger.effectiveOutbound, 1)
  assert.equal(ledger.expectedQty, 9)
})

test("records calibration separately without changing the logical expected balance", () => {
  const ledger = calculateWarehouseStockLedger([
    { reason: "SALE_OUTBOUND", movementType: "DOMESTIC_OUTBOUND", qty: -1, qtyBefore: 10, qtyAfter: 9, operationDate: at("2026-07-27T04:00:00Z"), createdAt: at("2026-07-27T04:00:00Z") },
    { reason: "STOCKTAKE_ADJUSTMENT", movementType: "ADJUSTMENT", qty: 2, qtyBefore: 7, qtyAfter: 9, operationDate: at("2026-08-13T04:00:00Z"), createdAt: at("2026-08-13T04:00:00Z"), relatedOrderType: LEDGER_CALIBRATION_TYPE },
  ], 9)
  assert.equal(ledger.calibrationAdjustment, 2)
  assert.equal(ledger.expectedQty, 9)
  assert.equal(ledger.hasLedgerCalibration, true)
})
