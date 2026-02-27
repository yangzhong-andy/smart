import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { notFound, handlePrismaError } from '@/lib/api-response'

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
      return notFound('Warehouse not found')
    }
    
    return NextResponse.json(warehouse)
  } catch (error: any) {
    return handlePrismaError(error, { notFoundMessage: 'Warehouse not found', serverMessage: 'Failed to fetch warehouse' })
  }
}

// PUT - 更新仓库
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

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
    return handlePrismaError(error, { notFoundMessage: 'Warehouse not found', serverMessage: 'Failed to update warehouse' })
  }
}

// DELETE - 删除仓库
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { id } = params
    
    await prisma.warehouse.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return handlePrismaError(error, { notFoundMessage: 'Warehouse not found', serverMessage: 'Failed to delete warehouse' })
  }
}
