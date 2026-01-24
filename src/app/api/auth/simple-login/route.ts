import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = '7d' // 7天

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    console.log('[SimpleLogin] Login attempt:', { email })

    // 验证输入
    if (!email || !password) {
      return NextResponse.json(
        { error: '邮箱和密码不能为空' },
        { status: 400 }
      )
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        department: true
      }
    })

    if (!user) {
      console.log('[SimpleLogin] User not found:', email)
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    // 检查用户是否启用
    if (!user.isActive) {
      console.log('[SimpleLogin] User is inactive:', user.id)
      return NextResponse.json(
        { error: '账号已被禁用，请联系管理员' },
        { status: 403 }
      )
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    if (!isPasswordValid) {
      console.log('[SimpleLogin] Password invalid for user:', user.id)
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    console.log('[SimpleLogin] Password verified, user:', {
      id: user.id,
      email: user.email,
      name: user.name,
      department: user.department?.name || '未分配'
    })

    // 如果用户没有部门，查找"品牌增长中心"并分配
    let departmentId = user.departmentId
    let departmentName = user.department?.name || null
    let departmentCode = user.department?.code || null

    if (!departmentId || !departmentName) {
      console.log('[SimpleLogin] User has no department, assigning default: 品牌增长中心')
      try {
        const defaultDept = await prisma.department.findFirst({
          where: { name: '品牌增长中心' }
        })
        
        if (defaultDept) {
          departmentId = defaultDept.id
          departmentName = defaultDept.name
          departmentCode = defaultDept.code
          console.log('[SimpleLogin] Default department assigned:', {
            id: departmentId,
            name: departmentName
          })
        } else {
          // 即使找不到，也设置默认值
          departmentName = '品牌增长中心'
          departmentCode = 'BRAND_GROWTH'
          console.log('[SimpleLogin] Using fallback default department')
        }
      } catch (deptError: any) {
        console.error('[SimpleLogin] Error fetching default department:', deptError)
        departmentName = '品牌增长中心'
        departmentCode = 'BRAND_GROWTH'
      }
    }

    // 更新最后登录时间（不阻塞登录）
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      })
    } catch (updateError: any) {
      console.warn('[SimpleLogin] Failed to update lastLoginAt:', updateError.message)
    }

    // 生成 JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: departmentId,
        departmentName: departmentName,
        departmentCode: departmentCode
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )

    console.log('[SimpleLogin] Token generated successfully')

    // 返回成功响应
    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: departmentId,
        departmentName: departmentName,
        departmentCode: departmentCode
      }
    })
  } catch (error: any) {
    console.error('[SimpleLogin] Error:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    })
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    )
  }
}
