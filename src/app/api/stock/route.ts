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
    
    // 转换数据格式（含变体 SKU：颜色、尺寸、条形码等）
    const transformed = stocks.map(stock => ({
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
      location: stock.warehouse.location,
      qty: stock.qty,
      reservedQty: stock.reservedQty,
      availableQty: stock.availableQty || (stock.qty - stock.reservedQty),
      costPrice: stock.variant.costPrice ? Number(stock.variant.costPrice) : 0,
      currency: stock.variant.currency,
      totalValue: (stock.qty - stock.reservedQty) * (stock.variant.costPrice ? Number(stock.variant.costPrice) : 0),
      updatedAt: stock.updatedAt.toISOString(),
      createdAt: stock.createdAt.toISOString()
    }))
    
    return NextResponse.json(transformed)
  } catch (error: any) {
    console.error('Error fetching stock:', error)
    
    // 如果表不存在，返回空数组
    if (error.message?.includes('does not exist') || error.code === 'P2021') {
      return NextResponse.json([])
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch stock', details: error.message },
      { status: 500 }
    )
  }
}
