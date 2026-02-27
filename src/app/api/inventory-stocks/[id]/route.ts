import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { InventoryLocation } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET - 获取单个库存
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const stock = await prisma.inventoryStock.findUnique({
      where: { id: params.id },
      include: {
        variant: {
          include: {
            product: true
          }
        },
        store: true
      }
    })

    if (!stock) {
      return NextResponse.json(
        { error: 'Inventory stock not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: stock.id,
      variantId: stock.variantId,
      productId: stock.variant.productId, // 向后兼容
      storeId: stock.storeId || undefined,
      location: stock.location,
      qty: stock.qty,
      updatedAt: stock.updatedAt.toISOString(),
      createdAt: stock.createdAt.toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch inventory stock' },
      { status: 500 }
    )
  }
}

// PUT - 更新库存
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.qty !== undefined) updateData.qty = Number(body.qty)
    if (body.location !== undefined) updateData.location = body.location as InventoryLocation

    const stock = await prisma.inventoryStock.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({
      id: stock.id,
      variantId: stock.variantId,
      productId: stock.variantId, // 向后兼容（使用 variantId 作为 productId）
      storeId: stock.storeId || undefined,
      location: stock.location,
      qty: stock.qty,
      updatedAt: stock.updatedAt.toISOString(),
      createdAt: stock.createdAt.toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update inventory stock' },
      { status: 500 }
    )
  }
}

// DELETE - 删除库存
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.inventoryStock.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete inventory stock' },
      { status: 500 }
    )
  }
}
