import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

// POST - 创建用户（仅 SUPER_ADMIN）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: '权限不足' }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, name, role, departmentId, isActive } = body

    const emailNorm = (email || '').trim().toLowerCase()
    if (!emailNorm) {
      return NextResponse.json({ error: '邮箱不能为空' }, { status: 400 })
    }
    if (!(name || '').trim()) {
      return NextResponse.json({ error: '姓名不能为空' }, { status: 400 })
    }
    if (!(password || '').trim()) {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { email: emailNorm },
    })
    if (existing) {
      return NextResponse.json({ error: '该邮箱已被使用' }, { status: 400 })
    }

    if (departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
      })
      if (!department) {
        return NextResponse.json({ error: '部门不存在' }, { status: 400 })
      }
    }

    const hashedPassword = await bcrypt.hash(password.trim(), 10)
    const user = await prisma.user.create({
      data: {
        email: emailNorm,
        password: hashedPassword,
        name: (name || '').trim(),
        role: role || 'USER',
        departmentId: departmentId || null,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
      include: { department: true },
    })

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.department?.name || null,
      departmentCode: user.department?.code || null,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '创建用户失败', details: error.message },
      { status: 500 }
    )
  }
}

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
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// DELETE - 删除用户（需 ADMIN 或 MANAGER）
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: '缺少用户 id' }, { status: 400 })
    }
    await prisma.user.delete({
      where: { id },
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
