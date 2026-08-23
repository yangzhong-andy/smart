import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateWarehouseAssetValue } from './warehouse-asset-ledger'

test('values the complete opening stock when the stocktake difference is zero', () => {
  const value = calculateWarehouseAssetValue(
    { qty: 0, qtyAfter: 100, unitCost: 12.5 },
    [],
  )

  assert.equal(value, 1250)
})

test('adds inbound value and subtracts outbound value after the opening stocktake', () => {
  const value = calculateWarehouseAssetValue(
    { qty: 20, qtyAfter: 100, unitCost: 10 },
    [
      { qty: 10, qtyAfter: 110, unitCost: 12 },
      { qty: -4, qtyAfter: 106, unitCost: 10 },
    ],
  )

  assert.equal(value, 1080)
})
