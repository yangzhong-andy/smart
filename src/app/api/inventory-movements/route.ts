import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { InventoryLocation, InventoryMovementType } from '@prisma/client'

// GET - 获取所有库存变动
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const location = searchParams.get('location')
    const movementType = searchParams.get('movementType')

    const where: any = {}
    if (productId) where.productId = productId
    if (location) where.location = location as InventoryLocation
    if (movementType) where.movementType = movementType as InventoryMovementType

    const movements = await prisma.inventoryMovement.findMany({
      where,
      include: {
        product: true
      },
      orderBy: { operationDate: 'desc' }
    })

    const transformed = movements.map(m => ({
      id: m.id,
      productId: m.productId,
      location: m.location,
      movementType: m.movementType,
      qty: m.qty,
      qtyBefore: m.qtyBefore,
      qtyAfter: m.qtyAfter,
      unitCost: m.unitCost ? Number(m.unitCost) : undefined,
      totalCost: m.totalCost ? Number(m.totalCost) : undefined,
      currency: m.currency || undefined,
      relatedOrderId: m.relatedOrderId || undefined,
      relatedOrderType: m.relatedOrderType || undefined,
      relatedOrderNumber: m.relatedOrderNumber || undefined,
      operator: m.operator || undefined,
      operationDate: m.operationDate.toISOString(),
      notes: m.notes || undefined,
      createdAt: m.createdAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching inventory movements:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory movements' },
      { status: 500 }
    )
  }
}

// POST - 创建新库存变动
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const movement = await prisma.inventoryMovement.create({
      data: {
        productId: body.productId,
        location: body.location as InventoryLocation,
        movementType: body.movementType as InventoryMovementType,
        qty: Number(body.qty),
        qtyBefore: Number(body.qtyBefore),
        qtyAfter: Number(body.qtyAfter),
        unitCost: body.unitCost ? Number(body.unitCost) : null,
        totalCost: body.totalCost ? Number(body.totalCost) : null,
        currency: body.currency || null,
        relatedOrderId: body.relatedOrderId || null,
        relatedOrderType: body.relatedOrderType || null,
        relatedOrderNumber: body.relatedOrderNumber || null,
        operator: body.operator || null,
        operationDate: new Date(body.operationDate),
        notes: body.notes || null
      }
    })

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
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating inventory movement:', error)
    return NextResponse.json(
      { error: 'Failed to create inventory movement' },
      { status: 500 }
    )
  }
}
