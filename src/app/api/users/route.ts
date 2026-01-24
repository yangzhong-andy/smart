import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

// GET - 获取所有用户（仅管理员）
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    
    // 检查权限：只有管理员可以查看所有用户
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    const users = await prisma.user.findMany({
      include: {
        department: true
      },
      orderBy: { createdAt: 'desc' }
    })

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

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

// POST - 创建新用户（仅管理员）
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    // 检查权限：只有管理员可以创建用户
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, name, role, departmentId } = body

    // 验证必填字段
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: '邮箱、密码和姓名不能为空' },
        { status: 400 }
      )
    }

    // 检查邮箱是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() }
    })

    if (existingUser) {
      return NextResponse.json(
        { error: '该邮箱已被使用' },
        { status: 400 }
      )
    }

    // 验证部门是否存在（如果提供了 departmentId）
    if (departmentId) {
      const department = await prisma.department.findUnique({
        where: { id: departmentId }
      })
      if (!department) {
        return NextResponse.json(
          { error: '部门不存在' },
          { status: 400 }
        )
      }
    }

    // 哈希密码
    const hashedPassword = await bcrypt.hash(password, 10)

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        name: name.trim(),
        role: role || null,
        departmentId: departmentId || null,
        isActive: true
      },
      include: {
        department: true
      }
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
      updatedAt: user.updatedAt.toISOString()
    }, { status: 201 })
  } catch (error: any) {
    console.error('Error creating user:', error)
    return NextResponse.json(
      { error: 'Failed to create user', details: error.message },
      { status: 500 }
    )
  }
}
