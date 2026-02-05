import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    
    const debugInfo: any = {
      step: 'start',
      email: email,
      timestamp: new Date().toISOString()
    }
    
    // 步骤 1: 查找用户
    debugInfo.step = 'findUser'
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: {
        department: true
      }
    })
    
    debugInfo.userFound = !!user
    if (user) {
      debugInfo.userId = user.id
      debugInfo.userName = user.name
      debugInfo.userEmail = user.email
      debugInfo.userIsActive = user.isActive
      debugInfo.userRole = user.role
      debugInfo.userDepartmentId = user.departmentId
      debugInfo.hasDepartment = !!user.department
      if (user.department) {
        debugInfo.departmentName = user.department.name
        debugInfo.departmentCode = user.department.code
      }
    }
    
    if (!user) {
      return NextResponse.json({
        success: false,
        error: '用户不存在',
        debug: debugInfo
      }, { status: 404 })
    }
    
    // 步骤 2: 检查用户状态
    debugInfo.step = 'checkUserStatus'
    if (!user.isActive) {
      return NextResponse.json({
        success: false,
        error: '账号已被禁用',
        debug: debugInfo
      }, { status: 403 })
    }
    
    // 步骤 3: 验证密码
    debugInfo.step = 'verifyPassword'
    let isPasswordValid = false
    try {
      isPasswordValid = await bcrypt.compare(password, user.password)
      debugInfo.passwordValid = isPasswordValid
    } catch (bcryptError: any) {
      debugInfo.bcryptError = bcryptError.message
      return NextResponse.json({
        success: false,
        error: '密码验证失败',
        debug: debugInfo
      }, { status: 500 })
    }
    
    if (!isPasswordValid) {
      return NextResponse.json({
        success: false,
        error: '密码错误',
        debug: debugInfo
      }, { status: 401 })
    }
    
    // 步骤 4: 构建返回对象
    debugInfo.step = 'buildResponse'
    const departmentName = user.department?.name || null
    const departmentCode = user.department?.code || null
    const departmentId = user.departmentId || null
    
    const userInfo = {
      id: user.id,
      email: user.email,
      name: user.name || '用户',
      role: user.role || null,
      departmentId: departmentId,
      departmentName: departmentName,
      departmentCode: departmentCode
    }
    
    debugInfo.userInfo = userInfo
    debugInfo.step = 'success'
    
    return NextResponse.json({
      success: true,
      user: userInfo,
      debug: debugInfo
    })
    
  } catch (error: any) {
    console.error('Test authorize error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
