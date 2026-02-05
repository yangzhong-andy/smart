import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    
    if (!email || !password) {
      return NextResponse.json(
        { error: '邮箱和密码不能为空' },
        { status: 400 }
      )
    }
    
    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { department: true }
    })
    
    if (!user) {
      return NextResponse.json(
        { 
          error: '用户不存在',
          found: false
        },
        { status: 404 }
      )
    }
    
    // 检查用户是否启用
    if (!user.isActive) {
      return NextResponse.json(
        { 
          error: '账号已被禁用',
          found: true,
          isActive: false
        },
        { status: 403 }
      )
    }
    
    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    return NextResponse.json({
      success: true,
      found: true,
      isActive: user.isActive,
      passwordValid: isPasswordValid,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
        departmentName: user.department?.name || null,
        departmentCode: user.department?.code || null
      },
      message: isPasswordValid 
        ? '登录验证成功' 
        : '密码错误'
    })
    
  } catch (error: any) {
    console.error('Test login error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
