import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取单个仓库
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    
    const warehouse = await prisma.warehouse.findUnique({
      where: { id }
    })
    
    if (!warehouse) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error fetching warehouse:', error)
    return NextResponse.json(
      { error: 'Failed to fetch warehouse', details: error.message },
      { status: 500 }
    )
  }
}

// PUT - 更新仓库
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    
    const updateData: Record<string, unknown> = {
      code: body.code,
      name: body.name,
      address: body.address,
      contact: body.contact,
      phone: body.phone,
      manager: body.manager,
      location: body.location,
      isActive: body.isActive !== undefined ? body.isActive : true,
      capacity: body.capacity,
      notes: body.notes
    }
    if (body.type !== undefined) {
      updateData.type = body.type === 'OVERSEAS' ? 'OVERSEAS' : 'DOMESTIC'
    }
    const warehouse = await prisma.warehouse.update({
      where: { id },
      data: updateData as any
    })
    
    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error updating warehouse:', error)
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to update warehouse', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - 删除仓库
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    
    await prisma.warehouse.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting warehouse:', error)
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to delete warehouse', details: error.message },
      { status: 500 }
    )
  }
}
