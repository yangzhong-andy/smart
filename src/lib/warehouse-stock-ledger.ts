export const LEDGER_CALIBRATION_TYPE = "INVENTORY_LEDGER_CALIBRATION"

export type WarehouseStockLedgerLog = {
  reason: string
  movementType: string
  qty: number
  qtyBefore: number
  qtyAfter: number
  operationDate: Date
  createdAt: Date
  relatedOrderType?: string | null
}

export type WarehouseStockLedger = {
  openingQty: number
  openingDate: Date | null
  inboundAfterOpening: number
  grossOutboundAfterOpening: number
  returnInboundAfterOpening: number
  effectiveOutbound: number
  otherAdjustments: number
  calibrationAdjustment: number
  expectedQty: number
  hasSystemBaseline: boolean
  hasLedgerCalibration: boolean
}

export function calculateWarehouseStockLedger(
  logs: WarehouseStockLedgerLog[],
  currentQty: number,
): WarehouseStockLedger {
  const ordered = [...logs].sort((a, b) => {
    const operationDelta = a.operationDate.getTime() - b.operationDate.getTime()
    return operationDelta || a.createdAt.getTime() - b.createdAt.getTime()
  })
  let formalOpeningIndex = -1
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const log = ordered[index]
    if (log.movementType === "STOCKTAKE" && log.relatedOrderType !== LEDGER_CALIBRATION_TYPE) {
      formalOpeningIndex = index
      break
    }
  }
  const firstOutboundIndex = ordered.findIndex(
    (log) => log.qty < 0 && log.movementType !== "STOCKTAKE" && log.movementType !== "ADJUSTMENT",
  )
  const firstBusinessIndex = ordered.findIndex(
    (log) => log.movementType !== "STOCKTAKE" && log.movementType !== "ADJUSTMENT",
  )
  const firstMovementIndex = firstOutboundIndex >= 0 ? firstOutboundIndex : firstBusinessIndex
  const hasFormalOpening = formalOpeningIndex >= 0
  const hasSystemBaseline = hasFormalOpening || firstMovementIndex >= 0
  const openingQty = hasFormalOpening
    ? ordered[formalOpeningIndex].qtyAfter
    : firstMovementIndex >= 0 ? ordered[firstMovementIndex].qtyBefore : currentQty
  const openingDate = hasFormalOpening
    ? ordered[formalOpeningIndex].operationDate
    : firstMovementIndex >= 0 ? ordered[firstMovementIndex].operationDate : null
  const postOpeningLogs = hasFormalOpening
    ? ordered.slice(formalOpeningIndex + 1)
    : firstMovementIndex >= 0 ? ordered.slice(firstMovementIndex) : []
  const businessLogs = postOpeningLogs.filter(
    (log) => log.movementType !== "STOCKTAKE" && log.movementType !== "ADJUSTMENT",
  )
  const inboundAfterOpening = businessLogs.reduce((sum, log) => sum + Math.max(0, log.qty), 0)
  const grossOutboundAfterOpening = businessLogs.reduce((sum, log) => sum + Math.abs(Math.min(0, log.qty)), 0)
  const returnInboundAfterOpening = postOpeningLogs
    .filter((log) => log.movementType === "ADJUSTMENT" && log.reason === "RETURN_INBOUND")
    .reduce((sum, log) => sum + Math.max(0, log.qty), 0)
  const calibrationLogs = postOpeningLogs.filter(
    (log) => log.relatedOrderType === LEDGER_CALIBRATION_TYPE,
  )
  const calibrationAdjustment = calibrationLogs.reduce((sum, log) => sum + log.qty, 0)
  const otherAdjustments = postOpeningLogs
    .filter((log) => log.movementType === "ADJUSTMENT" && log.reason !== "RETURN_INBOUND" && log.relatedOrderType !== LEDGER_CALIBRATION_TYPE)
    .reduce((sum, log) => sum + log.qty, 0)
  const effectiveOutbound = Math.max(0, grossOutboundAfterOpening - returnInboundAfterOpening)

  return {
    openingQty,
    openingDate,
    inboundAfterOpening,
    grossOutboundAfterOpening,
    returnInboundAfterOpening,
    effectiveOutbound,
    otherAdjustments,
    calibrationAdjustment,
    expectedQty: openingQty + inboundAfterOpening - effectiveOutbound + otherAdjustments,
    hasSystemBaseline,
    hasLedgerCalibration: calibrationLogs.length > 0,
  }
}
