import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

// PUT - 更新用户（仅管理员）
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    // 检查权限：只有管理员可以更新用户
    if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      )
    }

    const { id } = params
    const body = await request.json()
    const { email, password, name, role, departmentId } = body

    // 验证必填字段
    if (!name) {
      return NextResponse.json(
        { error: '姓名不能为空' },
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

    // 构建更新数据
    const updateData: any = {
      name: name.trim(),
      role: role || null,
      departmentId: departmentId || null
    }

    // 如果提供了新密码，则更新密码
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    // 更新用户
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
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
    })
  } catch (error: any) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user', details: error.message },
      { status: 500 }
    )
  }
}
