import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'

// 简单内存限流：IP -> { count, firstAttempt }
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW = 15 * 60 * 1000; // 15分钟

// 强制要求配置JWT密钥，不允许使用默认值
if (!process.env.JWT_SECRET && !process.env.NEXTAUTH_SECRET) {
  throw new Error('❌ 严重安全漏洞：JWT_SECRET 或 NEXTAUTH_SECRET 环境变量未配置！请在 .env 文件中添加 JWT_SECRET=你的安全密钥')
}

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-secret-key-change-in-production'
const JWT_EXPIRES_IN = '7d' // 7天

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // 限流检查
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const attempt = loginAttempts.get(clientIP);

    if (attempt && attempt.count >= MAX_ATTEMPTS && now - attempt.firstAttempt < LOCKOUT_WINDOW) {
      return NextResponse.json({ error: '登录尝试过多，请15分钟后再试' }, { status: 429 });
    }

    if (attempt) {
      attempt.count++;
    } else {
      loginAttempts.set(clientIP, { count: 1, firstAttempt: now });
    }


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
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    // 检查用户是否启用
    if (!user.isActive) {
      return NextResponse.json(
        { error: '账号已被禁用，请联系管理员' },
        { status: 403 }
      )
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    if (!isPasswordValid) {
      // 登录失败，限流已在上方处理
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    // 如果用户没有部门，查找"品牌增长中心"并分配
    let departmentId = user.departmentId
    let departmentName = user.department?.name || null
    let departmentCode = user.department?.code || null

    if (!departmentId || !departmentName) {
      try {
        const defaultDept = await prisma.department.findFirst({
          where: { name: '品牌增长中心' }
        })
        
        if (defaultDept) {
          departmentId = defaultDept.id
          departmentName = defaultDept.name
          departmentCode = defaultDept.code
        } else {
          // 即使找不到，也设置默认值
          departmentName = '品牌增长中心'
          departmentCode = 'BRAND_GROWTH'
        }
      } catch (deptError: any) {
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
      // 忽略 lastLoginAt 更新失败
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


    // 登录成功，清除限流记录
    loginAttempts.delete(clientIP);

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
    return NextResponse.json(
      { error: '登录失败，请稍后重试' },
      { status: 500 }
    )
  }
}
