import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'
import * as jwt from 'jsonwebtoken'

// JWT 密钥（应该从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// 部门代码到工作台的映射
const DEPARTMENT_WORKBENCH_MAP: Record<string, string> = {
  'BRAND_GROWTH': '/operations/purchase-orders',           // 品牌增长中心 → 订单发起页
  'MEDIA_STRATEGY': '/advertising/influencers',            // 媒介战略部 → 达人管理
  'GLOBAL_SUPPLY_CHAIN': '/procurement/purchase-orders',  // 全球供应链部 → 采购合同
  'FULFILLMENT_LOGISTICS': '/logistics/workbench',         // 履约物流中心 → 物流工作台
  'VISUAL_COMMUNICATION': '/advertising/workbench',        // 视觉传达部 → 广告工作台
  'CONTENT_PRODUCTION': '/advertising/workbench',          // 内容生产工厂 → 视频制作页（广告工作台）
  'FINANCE_CENTER': '/finance/workbench',                  // 财经中心 → 财务工作台
  // 保留旧部门代码的兼容性（向后兼容）
  'OPERATIONS': '/operations/purchase-orders',
  'VIDEO_EDITOR': '/advertising/workbench',
  'BD': '/advertising/influencers',
  'PROCUREMENT': '/procurement/purchase-orders',
  'LOGISTICS': '/logistics/workbench',
  'DESIGN': '/advertising/workbench',
  'FINANCE': '/finance/workbench',
}

export const dynamic = 'force-dynamic'

// 默认跳转路径（如果没有匹配的部门）
const DEFAULT_REDIRECT = '/'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

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
        department: true // 包含部门信息
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
      return NextResponse.json(
        { error: '邮箱或密码错误' },
        { status: 401 }
      )
    }

    // 更新最后登录时间
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    })

    // 生成 JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId
      },
      JWT_SECRET,
      { expiresIn: '7d' } // token 有效期 7 天
    )

    // 确定跳转路径
    let redirectPath = DEFAULT_REDIRECT
    if (user.department?.code) {
      redirectPath = DEPARTMENT_WORKBENCH_MAP[user.department.code] || DEFAULT_REDIRECT
    }

    // 返回用户信息和 token
    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        departmentId: user.departmentId,
        departmentName: user.department?.name || null,
        departmentCode: user.department?.code || null
      },
      redirectPath
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: '登录失败，请稍后重试', details: error.message },
      { status: 500 }
    )
  }
}
