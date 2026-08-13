export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateWarehouseAssetValue } from '@/lib/warehouse-asset-ledger'
import { calculateWarehouseStockLedger } from '@/lib/warehouse-stock-ledger'

// GET - 获取库存数据（支持筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get('warehouseId')
    const variantId = searchParams.get('variantId')
    const skuId = searchParams.get('skuId')
    const location = searchParams.get('location')
    const noCache = searchParams.get('noCache') === 'true'

    const where: any = {}

    if (warehouseId) {
      where.warehouseId = warehouseId
    }

    if (variantId) {
      where.variantId = variantId
    }

    if (skuId) {
      where.variant = {
        skuId: {
          contains: skuId,
          mode: 'insensitive'
        }
      }
    }
    if (location) {
      where.warehouse = { location: location as any }
    }

    const stocks = await prisma.stock.findMany({
      where,
      include: {
        variant: {
          include: {
            product: true
          }
        },
        warehouse: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    })

    const stockPairFilter = stocks.map((stock) => ({ warehouseId: stock.warehouseId, variantId: stock.variantId }))
    const [tiktokDeductions, stockLogs] = await Promise.all([
      prisma.tikTokStockDeduction.groupBy({
        by: ['warehouseId', 'variantId'],
        where: { status: 'deducted' },
        _sum: { qty: true },
      }),
      stockPairFilter.length ? prisma.stockLog.findMany({
        where: { OR: stockPairFilter },
        select: {
          id: true, warehouseId: true, variantId: true, movementType: true,
          qty: true, qtyBefore: true, qtyAfter: true, operationDate: true, reason: true,
          relatedOrderType: true,
          unitCost: true, totalCost: true, currency: true, evidence: true, createdAt: true,
        },
        orderBy: [{ operationDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }) : Promise.resolve([]),
    ])
    const deductionMap = new Map(
      tiktokDeductions.map(d => [`${d.warehouseId}_${d.variantId}`, d._sum.qty || 0])
    )
    const logMap = new Map<string, typeof stockLogs>()
    for (const log of stockLogs) {
      const key = `${log.warehouseId}_${log.variantId}`
      const rows = logMap.get(key) || []
      rows.push(log)
      logMap.set(key, rows)
    }

    // 转换数据格式
    const transformed = stocks.map(stock => {
      const tiktokDeducted = deductionMap.get(`${stock.warehouseId}_${stock.variantId}`) || 0
      const logs = logMap.get(`${stock.warehouseId}_${stock.variantId}`) || []
      const ledger = calculateWarehouseStockLedger(logs, stock.qty)
      let openingIndex = -1
      for (let index = logs.length - 1; index >= 0; index -= 1) {
        if (logs[index].movementType === 'STOCKTAKE' && Boolean(logs[index].evidence)) {
          openingIndex = index
          break
        }
      }
      let chainBalance = openingIndex >= 0 ? logs[openingIndex].qtyAfter : 0
      const openingQty = openingIndex >= 0 ? logs[openingIndex].qtyAfter : 0
      const postOpeningLogs = openingIndex >= 0 ? logs.slice(openingIndex + 1) : logs
      const postOpeningBusinessLogs = postOpeningLogs.filter(log => log.movementType !== 'STOCKTAKE' && log.movementType !== 'ADJUSTMENT')
      const inboundAfterOpening = postOpeningBusinessLogs.reduce((sum, log) => sum + Math.max(0, log.qty), 0)
      const outboundAfterOpening = postOpeningBusinessLogs.reduce((sum, log) => sum + Math.abs(Math.min(0, log.qty)), 0)
      const adjustmentAfterOpening = postOpeningLogs.filter(log => log.movementType === 'ADJUSTMENT').reduce((sum, log) => sum + log.qty, 0)
      let chainContinuous = openingIndex >= 0
      if (openingIndex >= 0) {
        for (const log of logs.slice(openingIndex + 1)) {
          if (log.qtyBefore !== chainBalance || log.qtyAfter !== chainBalance + log.qty) {
            chainContinuous = false
            break
          }
          chainBalance = log.qtyAfter
        }
      }
      const reconciliationDifference = stock.qty - ledger.expectedQty
      const reconciliationStatus = ledger.hasSystemBaseline && reconciliationDifference === 0
        ? openingIndex >= 0 ? 'RECONCILED' : 'SYSTEM_RECONCILED'
        : 'PENDING_STOCKTAKE'
      const openingLog = openingIndex >= 0 ? logs[openingIndex] : null
      const assetCurrency = openingLog?.currency || stock.variant.currency || 'CNY'
      const costLogs = openingLog ? [openingLog, ...postOpeningLogs] : []
      const costContinuous = Boolean(openingLog?.unitCost) && costLogs.every(log =>
        log.unitCost != null && Boolean(log.currency) && log.currency === assetCurrency
      )
      const ledgerAssetValue = costContinuous && openingLog
        ? calculateWarehouseAssetValue(openingLog, postOpeningLogs)
        : stock.qty * (stock.variant.costPrice ? Number(stock.variant.costPrice) : 0)
      const costPrice = stock.qty > 0 ? ledgerAssetValue / stock.qty : Number(openingLog?.unitCost || stock.variant.costPrice || 0)
      const assetStatus = reconciliationStatus !== 'RECONCILED'
        ? 'PENDING_STOCKTAKE'
        : costContinuous ? 'RECONCILED' : 'PENDING_COST_REVIEW'
      return {
        id: stock.id,
        variantId: stock.variantId,
        warehouseId: stock.warehouseId,
        skuId: stock.variant.skuId,
        productName: stock.variant.product.name,
        color: stock.variant.color ?? undefined,
        size: stock.variant.size ?? undefined,
        barcode: stock.variant.barcode ?? undefined,
        warehouseCode: stock.warehouse.code,
        warehouseName: stock.warehouse.name,
        warehouseType: stock.warehouse.type,
        location: stock.warehouse.location,
        qty: stock.qty,         // 当前库内实物库存
        tiktokDeducted,         // TikTok 有效累计出库量（已取消订单不计）
        availableQty: stock.availableQty,
        reservedQty: stock.reservedQty,
        lockedQty: stock.reservedQty,
        cumulativeInbound: ledger.openingQty + ledger.inboundAfterOpening,
        cumulativeOutbound: ledger.effectiveOutbound,
        openingQty: ledger.openingQty,
        openingDate: ledger.openingDate?.toISOString() || null,
        inboundAfterOpening: ledger.inboundAfterOpening,
        outboundAfterOpening: ledger.effectiveOutbound,
        returnInboundAfterOpening: ledger.returnInboundAfterOpening,
        adjustmentAfterOpening: ledger.otherAdjustments,
        calibrationAdjustment: ledger.calibrationAdjustment,
        hasLedgerCalibration: ledger.hasLedgerCalibration,
        netMovement: ledger.inboundAfterOpening - ledger.effectiveOutbound + ledger.otherAdjustments,
        ledgerQty: ledger.expectedQty,
        reconciliationDifference,
        reconciliationStatus,
        assetStatus,
        costContinuous,
        hasFormalStocktake: openingIndex >= 0,
        baselineSource: openingIndex >= 0 ? 'FORMAL_STOCKTAKE' : ledger.hasSystemBaseline ? 'SYSTEM_HISTORY' : 'CURRENT_BALANCE',
        costPrice,
        currency: assetCurrency,
        totalValue: ledgerAssetValue,
        confirmedAssetValue: assetStatus === 'RECONCILED' ? ledgerAssetValue : 0,
        provisionalAssetValue: assetStatus === 'RECONCILED' ? 0 : ledgerAssetValue,
        availableValue: (stock.qty - stock.reservedQty) * costPrice,
        updatedAt: stock.updatedAt.toISOString(),
        createdAt: stock.createdAt.toISOString()
      }
    })

    return NextResponse.json(
      transformed,
      noCache
        ? {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            }
          }
        : undefined
    )
  } catch (error) {
    console.error('库存数据获取失败:', error)
    return NextResponse.json(
      { error: '库存数据获取失败' },
      { status: 500 }
    )
  }
}

// POST - 创建库存记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { variantId, warehouseId, qty, reservedQty } = body

    if (!variantId || !warehouseId) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      )
    }

    const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { type: true } })
    if (warehouse?.type === 'OVERSEAS') {
      return NextResponse.json(
        { error: '海外仓初始库存必须通过正式盘点录入，不能直接创建库存余额' },
        { status: 400 }
      )
    }

    // 检查是否已存在
    const existing = await prisma.stock.findUnique({
      where: {
        variantId_warehouseId: {
          variantId,
          warehouseId,
        }
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: '该仓库已存在此SKU的库存记录' },
        { status: 400 }
      )
    }

    const stock = await prisma.stock.create({
      data: {
        variantId,
        warehouseId,
        qty: qty || 0,
        reservedQty: reservedQty || 0,
        availableQty: (qty || 0) - (reservedQty || 0),
      }
    })

    return NextResponse.json(stock)
  } catch (error) {
    console.error('创建库存记录失败:', error)
    return NextResponse.json(
      { error: '创建库存记录失败' },
      { status: 500 }
    )
  }
}
