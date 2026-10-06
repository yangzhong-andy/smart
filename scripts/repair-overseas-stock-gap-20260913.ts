import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.local" })
loadEnv()

import fs from "node:fs"
import path from "node:path"
import { InventoryMovementType, Prisma, StockLogReason } from "@prisma/client"
import { prisma } from "../src/lib/prisma"
import { createWarehouseResolver } from "../src/lib/profit-warehouse-mapping"
import { LEDGER_CALIBRATION_TYPE } from "../src/lib/warehouse-stock-ledger"

const REPAIR_NUMBER = "CAL-OVERSEAS-STOCK-20260913-V1"
const APPLY = process.argv.includes("--apply")

const WAREHOUSE = {
  globe: "8d9a0e46-5b84-4379-bfa7-20149318107e",
  panlian: "afab0afc-f8c4-41a6-bef5-cb7d70460bfc",
} as const

const VARIANT = {
  brushHeads: "8ff758b4-f01f-4ebc-8bad-1f119650be83",
  toiletBrush1: "f3f61c84-36ff-4035-85c5-75c973e84cfb",
  toiletBrush3: "f69a7cc6-c3ac-421e-a007-612c30767cc1",
} as const

const historicalAdjustments = [
  { warehouseId: WAREHOUSE.globe, variantId: VARIANT.toiletBrush3, qty: 184, reason: "历史 TikTok 并发写入覆盖少扣" },
  { warehouseId: WAREHOUSE.globe, variantId: VARIANT.brushHeads, qty: 18, reason: "历史 TikTok 并发写入覆盖少扣；按当前仓库账面归零，剩余仓库差异保留待核" },
] as const

const missingOrders = [
  {
    orderId: "585878344452572850",
    shopId: "7494616530852874052",
    warehouseId: WAREHOUSE.panlian,
    parts: [{ sellerSku: "FY-2F001", variantId: VARIANT.toiletBrush1, qty: 2 }],
  },
  {
    orderId: "585890237198403136",
    shopId: "7494684798870062816",
    warehouseId: WAREHOUSE.globe,
    parts: [
      { sellerSku: "FY-T1T3", variantId: VARIANT.toiletBrush1, qty: 1 },
      { sellerSku: "FY-T1T3", variantId: VARIANT.toiletBrush3, qty: 1 },
    ],
  },
  {
    orderId: "585892694097823172",
    shopId: "7494684798870062816",
    warehouseId: WAREHOUSE.globe,
    parts: [
      { sellerSku: "FY-T1T3", variantId: VARIANT.toiletBrush1, qty: 1 },
      { sellerSku: "FY-T1T3", variantId: VARIANT.toiletBrush3, qty: 1 },
    ],
  },
  {
    orderId: "585892992771130530",
    shopId: "7494684798870062816",
    warehouseId: WAREHOUSE.globe,
    parts: [
      { sellerSku: "FY-T1T3", variantId: VARIANT.toiletBrush1, qty: 1 },
      { sellerSku: "FY-T1T3", variantId: VARIANT.toiletBrush3, qty: 1 },
    ],
  },
] as const

const allowedStatuses = new Set(["IN_TRANSIT", "DELIVERED", "COMPLETED"])

function pairKey(warehouseId: string, variantId: string) {
  return `${warehouseId}\u0000${variantId}`
}

function stableParts(parts: Array<{ sellerSku: string; variantId: string; qty: number }>) {
  return [...parts].sort((left, right) => `${left.sellerSku}:${left.variantId}`.localeCompare(`${right.sellerSku}:${right.variantId}`))
}

async function validatePlan(db: any) {
  const orderIds = missingOrders.map((order) => order.orderId)
  const shopIds = [...new Set(missingOrders.map((order) => order.shopId))]
  const [markerCount, orders, deductions, orderLogs, warehouseMappings, switchRules, profitMappings, directMappings] = await Promise.all([
    db.stockLog.count({ where: { relatedOrderType: LEDGER_CALIBRATION_TYPE, relatedOrderNumber: REPAIR_NUMBER } }),
    db.tikTokOrder.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, shopId: true, status: true, orderStatus: true, createTime: true, rawData: true } }),
    db.tikTokStockDeduction.findMany({ where: { tiktokOrderId: { in: orderIds } }, select: { tiktokOrderId: true, variantId: true, status: true } }),
    db.stockLog.findMany({ where: { relatedOrderId: { in: orderIds }, relatedOrderType: "TIKTOK_ORDER" }, select: { relatedOrderId: true, variantId: true, qty: true } }),
    db.tikTokWarehouseMapping.findMany({ select: { tiktokWarehouseId: true, tiktokShopId: true, warehouseId: true } }),
    db.profitWarehouseSwitchRule.findMany({ where: { platform: "TIKTOK", shopId: { in: shopIds } }, select: { platform: true, region: true, shopId: true, externalWarehouseId: true, warehouseId: true, effectiveFrom: true, effectiveOrderId: true } }),
    db.profitSkuMapping.findMany({ where: { platform: "TIKTOK", shopId: { in: shopIds }, enabled: true }, select: { shopId: true, sellerSku: true, components: { select: { variantId: true, quantity: true } } } }),
    db.tikTokSkuMapping.findMany({ where: { tiktokShopId: { in: shopIds } }, select: { tiktokShopId: true, sellerSku: true, variantId: true } }),
  ])

  if (markerCount > 0) throw new Error(`${REPAIR_NUMBER} 已执行，拒绝重复校准`)
  if (orders.length !== missingOrders.length) throw new Error(`缺少待补订单：预期 ${missingOrders.length}，实际 ${orders.length}`)
  if (deductions.length > 0 || orderLogs.length > 0) {
    throw new Error(`待补订单已出现扣减数据，拒绝重复扣除：deductions=${deductions.length}, logs=${orderLogs.length}`)
  }

  const resolver = createWarehouseResolver(warehouseMappings, switchRules)
  const profitMap = new Map(profitMappings.map((mapping: any) => [
    `${mapping.shopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`,
    mapping.components.map((component: any) => ({ variantId: component.variantId, quantity: Number(component.quantity) })),
  ]))
  const directMap = new Map(directMappings.map((mapping: any) => [
    `${mapping.tiktokShopId}\u0000${mapping.sellerSku.trim().toLowerCase()}`,
    [{ variantId: mapping.variantId, quantity: 1 }],
  ]))

  const validatedOrders = []
  for (const expected of missingOrders) {
    const order = orders.find((row: any) => row.orderId === expected.orderId)
    const status = String(order.status || order.orderStatus || "").toUpperCase()
    if (!allowedStatuses.has(status)) throw new Error(`订单 ${expected.orderId} 状态 ${status} 不是已发货状态`)
    if (order.shopId !== expected.shopId) throw new Error(`订单 ${expected.orderId} 店铺发生变化`)
    const raw = order.rawData as Record<string, any>
    const resolution = resolver(raw, order.shopId, order.createTime, "TIKTOK", null, order.orderId)
    if (resolution.status !== "mapped" || resolution.warehouseId !== expected.warehouseId) {
      throw new Error(`订单 ${expected.orderId} 仓库不符：预期 ${expected.warehouseId}，实际 ${resolution.warehouseId || resolution.status}`)
    }
    const baseline = await db.stockLog.findFirst({
      where: { warehouseId: expected.warehouseId, relatedOrderType: "PROFIT_ORDER_STOCK_BASELINE" },
      select: { operationDate: true },
      orderBy: { operationDate: "asc" },
    })
    if (!baseline || !order.createTime || order.createTime <= baseline.operationDate) {
      throw new Error(`订单 ${expected.orderId} 不在库存基线之后，拒绝补扣`)
    }

    const quantities = new Map<string, number>()
    for (const item of Array.isArray(raw.line_items) ? raw.line_items : []) {
      const sellerSku = String(item?.seller_sku || item?.sellerSku || item?.sku || "").trim()
      if (!sellerSku) continue
      quantities.set(sellerSku, (quantities.get(sellerSku) || 0) + Math.max(1, Math.round(Number(item?.quantity || 1))))
    }
    const actualParts: Array<{ sellerSku: string; variantId: string; qty: number }> = []
    for (const [sellerSku, sellerQty] of quantities) {
      const key = `${order.shopId}\u0000${sellerSku.toLowerCase()}`
      const components = (profitMap.get(key) || directMap.get(key) || []) as Array<{ variantId: string; quantity: number }>
      for (const component of components) {
        actualParts.push({ sellerSku, variantId: component.variantId, qty: sellerQty * Math.max(1, component.quantity) })
      }
    }
    if (JSON.stringify(stableParts(actualParts)) !== JSON.stringify(stableParts([...expected.parts]))) {
      throw new Error(`订单 ${expected.orderId} SKU/BOM 已变化：${JSON.stringify(actualParts)}`)
    }
    validatedOrders.push({ ...expected, status, parts: actualParts })
  }

  const keys = [...new Set([
    ...historicalAdjustments.map((row) => pairKey(row.warehouseId, row.variantId)),
    ...missingOrders.flatMap((order) => order.parts.map((part) => pairKey(order.warehouseId, part.variantId))),
  ])]
  const pairs = keys.map((key) => {
    const [warehouseId, variantId] = key.split("\u0000")
    return { warehouseId, variantId }
  })
  const stocks = await db.stock.findMany({
    where: { OR: pairs },
    include: { warehouse: { select: { name: true } }, variant: { select: { skuId: true, costPrice: true, currency: true } } },
  })
  if (stocks.length !== pairs.length) throw new Error(`缺少库存行：预期 ${pairs.length}，实际 ${stocks.length}`)

  const requiredByKey = new Map<string, number>()
  for (const row of historicalAdjustments) requiredByKey.set(pairKey(row.warehouseId, row.variantId), row.qty)
  for (const order of missingOrders) {
    for (const part of order.parts) {
      const key = pairKey(order.warehouseId, part.variantId)
      requiredByKey.set(key, (requiredByKey.get(key) || 0) + part.qty)
    }
  }
  for (const stock of stocks) {
    const required = requiredByKey.get(pairKey(stock.warehouseId, stock.variantId)) || 0
    if (stock.qty < required || stock.availableQty < required) {
      throw new Error(`${stock.warehouse.name}/${stock.variant.skuId} 库存不足：账面 ${stock.qty}，可用 ${stock.availableQty}，需扣 ${required}`)
    }
  }
  return { validatedOrders, stocks, requiredByKey, keys: keys.sort() }
}

async function main() {
  const dryRun = await validatePlan(prisma)
  const plan = dryRun.stocks.map((stock: any) => {
    const deductQty = dryRun.requiredByKey.get(pairKey(stock.warehouseId, stock.variantId)) || 0
    return {
      warehouse: stock.warehouse.name,
      sku: stock.variant.skuId,
      beforeQty: stock.qty,
      deductQty,
      afterQty: stock.qty - deductQty,
    }
  })
  if (!APPLY) {
    console.log(JSON.stringify({ mode: "dry-run", repairNumber: REPAIR_NUMBER, plan, orders: dryRun.validatedOrders }, null, 2))
    return
  }

  const backupDir = "/srv/smart-erp/baxi/data-backups"
  fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, `${REPAIR_NUMBER}-before-${new Date().toISOString().replace(/[:.]/g, "-")}.json`)
  fs.writeFileSync(backupFile, JSON.stringify({ createdAt: new Date().toISOString(), repairNumber: REPAIR_NUMBER, plan, orders: dryRun.validatedOrders }, null, 2))

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${REPAIR_NUMBER}))`
    for (const key of dryRun.keys) {
      const [warehouseId, variantId] = key.split("\u0000")
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-stock:${warehouseId}:${variantId}`}))`
    }
    const checked = await validatePlan(tx)
    const movements: any[] = []

    for (const adjustment of historicalAdjustments) {
      const stock = await tx.stock.findUniqueOrThrow({
        where: { variantId_warehouseId: { warehouseId: adjustment.warehouseId, variantId: adjustment.variantId } },
        include: { warehouse: { select: { name: true } }, variant: { select: { skuId: true, costPrice: true, currency: true } } },
      })
      const qtyAfter = stock.qty - adjustment.qty
      await tx.stock.update({ where: { id: stock.id }, data: { qty: qtyAfter, availableQty: stock.availableQty - adjustment.qty } })
      const unitCost = new Prisma.Decimal(stock.variant.costPrice || 0)
      await tx.stockLog.create({
        data: {
          warehouseId: stock.warehouseId,
          variantId: stock.variantId,
          reason: StockLogReason.STOCKTAKE_ADJUSTMENT,
          movementType: InventoryMovementType.ADJUSTMENT,
          qty: -adjustment.qty,
          qtyBefore: stock.qty,
          qtyAfter,
          unitCost,
          totalCost: unitCost.mul(-adjustment.qty),
          currency: stock.variant.currency || "CNY",
          operator: "system inventory audit",
          operationDate: new Date(),
          relatedOrderType: LEDGER_CALIBRATION_TYPE,
          relatedOrderNumber: REPAIR_NUMBER,
          notes: `${adjustment.reason}，按真实入库与三平台已出库订单核对补扣 ${adjustment.qty} 件`,
        },
      })
      movements.push({ kind: "historical-calibration", warehouse: stock.warehouse.name, sku: stock.variant.skuId, qty: adjustment.qty, beforeQty: stock.qty, afterQty: qtyAfter })
    }

    for (const order of checked.validatedOrders) {
      for (const part of order.parts) {
        const stock = await tx.stock.findUniqueOrThrow({
          where: { variantId_warehouseId: { warehouseId: order.warehouseId, variantId: part.variantId } },
          include: { warehouse: { select: { name: true } }, variant: { select: { skuId: true } } },
        })
        const qtyAfter = stock.qty - part.qty
        await tx.stock.update({ where: { id: stock.id }, data: { qty: qtyAfter, availableQty: stock.availableQty - part.qty } })
        await tx.stockLog.create({
          data: {
            warehouseId: stock.warehouseId,
            variantId: stock.variantId,
            reason: StockLogReason.SALE_OUTBOUND,
            movementType: InventoryMovementType.DOMESTIC_OUTBOUND,
            qty: -part.qty,
            qtyBefore: stock.qty,
            qtyAfter,
            operationDate: new Date(),
            relatedOrderId: order.orderId,
            relatedOrderType: "TIKTOK_ORDER",
            relatedOrderNumber: order.orderId,
            notes: `TikTok 已发货订单漏扣修复：${part.sellerSku}`,
          },
        })
        await tx.tikTokStockDeduction.create({
          data: {
            tiktokOrderId: order.orderId,
            shopId: order.shopId,
            warehouseId: order.warehouseId,
            variantId: part.variantId,
            sellerSku: part.sellerSku,
            qty: part.qty,
            status: "deducted",
          },
        })
        movements.push({ kind: "missing-order", orderId: order.orderId, warehouse: stock.warehouse.name, sku: stock.variant.skuId, qty: part.qty, beforeQty: stock.qty, afterQty: qtyAfter })
      }
    }

    const variantIds = [...new Set([...historicalAdjustments.map((row) => row.variantId), ...missingOrders.flatMap((order) => order.parts.map((part) => part.variantId))])]
    for (const variantId of variantIds) {
      const [variant, overseas] = await Promise.all([
        tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { atFactory: true, atDomestic: true } }),
        tx.stock.aggregate({ where: { variantId, warehouse: { type: "OVERSEAS" } }, _sum: { qty: true } }),
      ])
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stockQuantity: variant.atFactory + variant.atDomestic + Number(overseas._sum.qty || 0) },
      })
    }
    return movements
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 })

  console.log(JSON.stringify({ mode: "applied", repairNumber: REPAIR_NUMBER, backupFile, totalDeducted: result.reduce((sum, row) => sum + row.qty, 0), movements: result }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
