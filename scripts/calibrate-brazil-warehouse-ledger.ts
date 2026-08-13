import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import { Prisma, StockLogReason } from "@prisma/client"
import { prisma } from "../src/lib/prisma"
import { LEDGER_CALIBRATION_TYPE } from "../src/lib/warehouse-stock-ledger"

const CALIBRATION_NUMBER = "CAL-BR-WAREHOUSE-20260701-V1"
const targets = [
  { warehouseId: "8d9a0e46-5b84-4379-bfa7-20149318107e", variantId: "8ff758b4-f01f-4ebc-8bad-1f119650be83", openingQty: 2464, effectiveOutbound: 151, currentQty: 2309 },
  { warehouseId: "8d9a0e46-5b84-4379-bfa7-20149318107e", variantId: "f3f61c84-36ff-4035-85c5-75c973e84cfb", openingQty: 7920, effectiveOutbound: 47, currentQty: 7872 },
  { warehouseId: "8d9a0e46-5b84-4379-bfa7-20149318107e", variantId: "f69a7cc6-c3ac-421e-a007-612c30767cc1", openingQty: 26208, effectiveOutbound: 375, currentQty: 25826 },
  { warehouseId: "afab0afc-f8c4-41a6-bef5-cb7d70460bfc", variantId: "8ff758b4-f01f-4ebc-8bad-1f119650be83", openingQty: 2640, effectiveOutbound: 2633, currentQty: 7 },
  { warehouseId: "afab0afc-f8c4-41a6-bef5-cb7d70460bfc", variantId: "f3f61c84-36ff-4035-85c5-75c973e84cfb", openingQty: 3400, effectiveOutbound: 1389, currentQty: 2011 },
  { warehouseId: "afab0afc-f8c4-41a6-bef5-cb7d70460bfc", variantId: "f69a7cc6-c3ac-421e-a007-612c30767cc1", openingQty: 19144, effectiveOutbound: 9268, currentQty: 9878 },
] as const

async function main() {
  const existing = await prisma.stockLog.count({ where: { relatedOrderType: LEDGER_CALIBRATION_TYPE, relatedOrderNumber: CALIBRATION_NUMBER } })
  if (existing > 0) throw new Error(`Calibration ${CALIBRATION_NUMBER} already exists (${existing} rows)`)

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${CALIBRATION_NUMBER}))`
    for (const target of targets) {
      const [stock, variant, deductions, firstLog] = await Promise.all([
        tx.stock.findUnique({ where: { variantId_warehouseId: { variantId: target.variantId, warehouseId: target.warehouseId } } }),
        tx.productVariant.findUnique({ where: { id: target.variantId }, select: { skuId: true, costPrice: true, currency: true } }),
        tx.tikTokStockDeduction.aggregate({ where: { warehouseId: target.warehouseId, variantId: target.variantId, status: "deducted" }, _sum: { qty: true } }),
        tx.stockLog.findFirst({ where: { warehouseId: target.warehouseId, variantId: target.variantId, reason: StockLogReason.SALE_OUTBOUND }, orderBy: [{ operationDate: "asc" }, { createdAt: "asc" }] }),
      ])
      if (!stock || !variant || !firstLog) throw new Error(`Missing audited stock chain for ${target.warehouseId}/${target.variantId}`)
      const checks = { currentQty: stock.qty, openingQty: firstLog.qtyBefore, effectiveOutbound: Number(deductions._sum.qty || 0) }
      if (checks.currentQty !== target.currentQty || checks.openingQty !== target.openingQty || checks.effectiveOutbound !== target.effectiveOutbound) {
        throw new Error(`Audit precondition changed for ${variant.skuId}: ${JSON.stringify(checks)}`)
      }

      const correctedQty = target.openingQty - target.effectiveOutbound
      const difference = correctedQty - stock.qty
      const reservedQty = Math.min(stock.reservedQty, correctedQty)
      await tx.stock.update({ where: { id: stock.id }, data: { qty: correctedQty, reservedQty, availableQty: correctedQty - reservedQty } })
      const unitCost = Number(variant.costPrice || 0)
      await tx.stockLog.create({
        data: {
          warehouseId: target.warehouseId, variantId: target.variantId,
          reason: StockLogReason.STOCKTAKE_ADJUSTMENT, movementType: InventoryMovementType.ADJUSTMENT,
          qty: difference, qtyBefore: stock.qty, qtyAfter: correctedQty,
          unitCost: new Prisma.Decimal(unitCost), totalCost: new Prisma.Decimal(correctedQty).mul(unitCost),
          currency: variant.currency || "CNY", operator: "system inventory audit", operationDate: new Date(),
          relatedOrderType: LEDGER_CALIBRATION_TYPE, relatedOrderNumber: CALIBRATION_NUMBER,
          notes: `2026-07-01 audited opening ${target.openingQty} - effective order outbound ${target.effectiveOutbound} = ${correctedQty}; concurrency drift ${difference >= 0 ? "+" : ""}${difference}`,
        },
      })
    }

    const variantIds = [...new Set(targets.map((target) => target.variantId))]
    for (const variantId of variantIds) {
      const [variant, overseas] = await Promise.all([
        tx.productVariant.findUniqueOrThrow({ where: { id: variantId } }),
        tx.stock.aggregate({ where: { variantId, warehouse: { type: "OVERSEAS" } }, _sum: { qty: true } }),
      ])
      await tx.productVariant.update({
        where: { id: variantId },
        data: { inTransit: 0, stockQuantity: variant.atFactory + variant.atDomestic + Number(overseas._sum.qty || 0) },
      })
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 })

  console.log(JSON.stringify({ calibration: CALIBRATION_NUMBER, rows: targets.length, correctedTotal: targets.reduce((sum, target) => sum + target.openingQty - target.effectiveOutbound, 0) }, null, 2))
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
