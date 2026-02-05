import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { InventoryLocation } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET - 获取所有库存
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId') || searchParams.get('productId') // 向后兼容
    const storeId = searchParams.get('storeId')
    const location = searchParams.get('location')

    const where: any = {}
    if (variantId) where.variantId = variantId
    if (storeId) where.storeId = storeId
    if (location) where.location = location as InventoryLocation

    const stocks = await prisma.inventoryStock.findMany({
      where,
      include: {
        variant: {
          include: {
            product: true
          }
        },
        store: true
      },
      orderBy: { updatedAt: 'desc' }
    })

    const transformed = stocks.map(s => ({
      id: s.id,
      variantId: s.variantId,
      productId: s.variant.productId, // 向后兼容
      storeId: s.storeId || undefined,
      location: s.location,
      qty: s.qty,
      updatedAt: s.updatedAt.toISOString(),
      createdAt: s.createdAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching inventory stocks:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory stocks' },
      { status: 500 }
    )
  }
}

// POST - 创建或更新库存
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // 使用 variantId（向后兼容 productId）
    const variantId = body.variantId || body.productId
    if (!variantId) {
      return NextResponse.json(
        { error: 'variantId is required' },
        { status: 400 }
      )
    }

    // 使用 upsert 创建或更新库存
    const stock = await prisma.inventoryStock.upsert({
      where: {
        variantId_location_storeId: {
          variantId: variantId,
          location: body.location as InventoryLocation,
          storeId: body.storeId || null
        }
      },
      update: {
        qty: Number(body.qty)
      },
      create: {
        variantId: variantId,
        storeId: body.storeId || null,
        location: body.location as InventoryLocation,
        qty: Number(body.qty)
      },
      include: {
        variant: {
          include: {
            product: true
          }
        },
        store: true
      }
    })

    return NextResponse.json({
      id: stock.id,
      variantId: stock.variantId,
      productId: stock.variant.productId, // 向后兼容
      storeId: stock.storeId || undefined,
      location: stock.location,
      qty: stock.qty,
      updatedAt: stock.updatedAt.toISOString(),
      createdAt: stock.createdAt.toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating/updating inventory stock:', error)
    return NextResponse.json(
      { error: 'Failed to create/update inventory stock' },
      { status: 500 }
    )
  }
}
