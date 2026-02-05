import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取所有仓库
export async function GET() {
  try {
    // 检查表是否存在（如果表不存在，返回空数组而不是错误）
    const warehouses = await prisma.warehouse.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })
    
    return NextResponse.json(warehouses)
  } catch (error: any) {
    console.error('Error fetching warehouses:', error)
    
    // 如果表不存在，返回空数组
    if (error.message?.includes('does not exist') || error.code === 'P2021') {
      return NextResponse.json([])
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch warehouses', details: error.message },
      { status: 500 }
    )
  }
}

// POST - 创建新仓库
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const warehouse = await prisma.warehouse.create({
      data: {
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
    })
    
    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error creating warehouse:', error)
    return NextResponse.json(
      { error: 'Failed to create warehouse', details: error.message },
      { status: 500 }
    )
  }
}
