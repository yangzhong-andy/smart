import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取仓库。默认只返回启用的；?all=1 时返回全部（供仓储管理页使用）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const all = searchParams.get('all') === '1'
    const warehouses = await prisma.warehouse.findMany({
      where: all ? undefined : { isActive: true },
      orderBy: { createdAt: 'desc' }
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
    const codeRaw = body.code != null ? String(body.code).trim() : ''
    const code = codeRaw || `WH-${Date.now()}`
    const location = body.location || 'DOMESTIC'
    const typeVal = body.type === 'OVERSEAS' ? 'OVERSEAS' : 'DOMESTIC'

    const warehouse = await prisma.warehouse.create({
      data: {
        code,
        name: body.name,
        address: body.address,
        contact: body.contact,
        phone: body.phone,
        manager: body.manager,
        location,
        type: typeVal,
        isActive: body.isActive !== undefined ? body.isActive : true,
        capacity: body.capacity,
        notes: body.notes
      }
    })
    return NextResponse.json(warehouse)
  } catch (error: any) {
    console.error('Error creating warehouse:', error)
    const details = error?.message || ''
    const friendly =
      details.includes('Unique constraint') || details.includes('P2002')
        ? '仓库编码已存在，请换一个编码'
        : details.includes('type') || details.includes('column') || details.includes('does not exist')
          ? '数据库缺少仓库 type 字段。请在项目目录执行：npx prisma migrate deploy'
          : '创建失败，请检查必填项后重试'
    return NextResponse.json(
      { error: friendly, details },
      { status: 500 }
    )
  }
}
