export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

    // 获取 TikTok 扣减统计（按仓库+变体分组）
    const tiktokDeductions = await prisma.tikTokStockDeduction.groupBy({
      by: ['warehouseId', 'variantId'],
      _sum: { qty: true },
    })
    const deductionMap = new Map(
      tiktokDeductions.map(d => [`${d.warehouseId}_${d.variantId}`, d._sum.qty || 0])
    )

    // 转换数据格式
    const transformed = stocks.map(stock => {
      const tiktokDeducted = deductionMap.get(`${stock.warehouseId}_${stock.variantId}`) || 0
      const originalQty = stock.qty + tiktokDeducted // 原始库存 = 当前库存 + 已出库
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
        qty: originalQty,       // 总库存 = 原始库存（含已出库）
        tiktokDeducted,         // TikTok 出库量
        availableQty: stock.qty, // 可用 = 扣减后的实际剩余
        reservedQty: stock.reservedQty,
        lockedQty: tiktokDeducted, // 锁定 = TikTok 出库量
        costPrice: stock.variant.costPrice ? Number(stock.variant.costPrice) : 0,
        currency: stock.variant.currency,
        totalValue: (stock.qty - stock.reservedQty) * (stock.variant.costPrice ? Number(stock.variant.costPrice) : 0),
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
