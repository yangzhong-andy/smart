import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取所有用户（仅管理员）
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const departmentId = searchParams.get('departmentId')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: any = {}
    if (role) where.role = role
    if (departmentId) where.departmentId = departmentId

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true,
          departmentId: true, isActive: true, lastLoginAt: true,
          createdAt: true, updatedAt: true,
          department: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ])

    const transformed = users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      departmentId: u.departmentId,
      departmentName: u.department?.name || null,
      departmentCode: u.department?.code || null,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt?.toISOString() || null,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString()
    }))

    return NextResponse.json({
      data: transformed,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
