export type WarehouseAssetCostLog = {
  qty: number
  qtyAfter: number
  unitCost: unknown
}

export function calculateWarehouseAssetValue(
  openingLog: WarehouseAssetCostLog,
  postOpeningLogs: WarehouseAssetCostLog[],
): number {
  const openingValue = openingLog.qtyAfter * Number(openingLog.unitCost)
  const movementValue = postOpeningLogs.reduce(
    (sum, log) => sum + log.qty * Number(log.unitCost),
    0,
  )

  return openingValue + movementValue
}
