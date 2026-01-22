import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { InventoryLocation, InventoryMovementType } from '@prisma/client'

// GET - 获取单个库存变动
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const movement = await prisma.inventoryMovement.findUnique({
      where: { id: params.id },
      include: {
        product: true
      }
    })

    if (!movement) {
      return NextResponse.json(
        { error: 'Inventory movement not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: movement.id,
      productId: movement.productId,
      location: movement.location,
      movementType: movement.movementType,
      qty: movement.qty,
      qtyBefore: movement.qtyBefore,
      qtyAfter: movement.qtyAfter,
      unitCost: movement.unitCost ? Number(movement.unitCost) : undefined,
      totalCost: movement.totalCost ? Number(movement.totalCost) : undefined,
      currency: movement.currency || undefined,
      relatedOrderId: movement.relatedOrderId || undefined,
      relatedOrderType: movement.relatedOrderType || undefined,
      relatedOrderNumber: movement.relatedOrderNumber || undefined,
      operator: movement.operator || undefined,
      operationDate: movement.operationDate.toISOString(),
      notes: movement.notes || undefined,
      createdAt: movement.createdAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching inventory movement:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory movement' },
      { status: 500 }
    )
  }
}

// DELETE - 删除库存变动
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.inventoryMovement.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting inventory movement:', error)
    return NextResponse.json(
      { error: 'Failed to delete inventory movement' },
      { status: 500 }
    )
  }
}
