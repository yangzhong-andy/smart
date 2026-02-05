import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const results: any = {
    timestamp: new Date().toISOString(),
    steps: []
  }

  try {
    const { email, password } = await request.json()

    // 步骤 1: 检查输入
    results.steps.push({ step: 1, action: '检查输入', success: true })
    if (!email || !password) {
      return NextResponse.json({
        success: false,
        error: '邮箱和密码不能为空',
        results
      }, { status: 400 })
    }

    // 步骤 2: 查找用户
    results.steps.push({ step: 2, action: '查找用户', status: '开始' })
    let user
    try {
      user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        include: { department: true }
      })
      results.steps[results.steps.length - 1].success = !!user
      results.steps[results.steps.length - 1].userFound = !!user
    } catch (dbError: any) {
      results.steps[results.steps.length - 1].success = false
      results.steps[results.steps.length - 1].error = dbError.message
      return NextResponse.json({
        success: false,
        error: '数据库查询失败',
        details: dbError.message,
        results
      }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({
        success: false,
        error: '用户不存在',
        results
      }, { status: 404 })
    }

    results.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      hasDepartment: !!user.department,
      departmentId: user.departmentId,
      departmentName: user.department?.name || null,
      departmentCode: user.department?.code || null
    }

    // 步骤 3: 检查用户状态
    results.steps.push({ step: 3, action: '检查用户状态', success: user.isActive })
    if (!user.isActive) {
      return NextResponse.json({
        success: false,
        error: '账号已被禁用',
        results
      }, { status: 403 })
    }

    // 步骤 4: 验证密码
    results.steps.push({ step: 4, action: '验证密码', status: '开始' })
    let isPasswordValid = false
    try {
      isPasswordValid = await bcrypt.compare(password, user.password)
      results.steps[results.steps.length - 1].success = isPasswordValid
    } catch (bcryptError: any) {
      results.steps[results.steps.length - 1].success = false
      results.steps[results.steps.length - 1].error = bcryptError.message
      return NextResponse.json({
        success: false,
        error: '密码验证失败',
        details: bcryptError.message,
        results
      }, { status: 500 })
    }

    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        error: '密码错误',
        results
      }, { status: 401 })
    }

    // 步骤 5: 构建返回对象
    results.steps.push({ step: 5, action: '构建返回对象', status: '开始' })
    const userInfo = {
      id: user.id,
      email: user.email,
      name: user.name || '用户',
      role: user.role || null,
      departmentId: user.departmentId || null,
      departmentName: user.department?.name || null,
      departmentCode: user.department?.code || null
    }
    results.steps[results.steps.length - 1].success = true
    results.steps[results.steps.length - 1].userInfo = userInfo

    return NextResponse.json({
      success: true,
      user: userInfo,
      results
    })

  } catch (error: any) {
    results.steps.push({
      step: 'error',
      action: '捕获异常',
      success: false,
      error: error.message,
      stack: error.stack
    })
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      results
    }, { status: 500 })
  }
}
