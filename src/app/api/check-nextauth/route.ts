import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const results: any = {
      timestamp: new Date().toISOString(),
      checks: {}
    }
    
    // 检查 1: 环境变量
    results.checks.env = {
      hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
      hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
      nextAuthUrl: process.env.NEXTAUTH_URL || '未设置',
      nextAuthSecretLength: process.env.NEXTAUTH_SECRET?.length || 0
    }
    
    // 检查 2: 数据库连接
    try {
      const userCount = await prisma.user.count()
      results.checks.database = {
        connected: true,
        userCount
      }
    } catch (dbError: any) {
      results.checks.database = {
        connected: false,
        error: dbError.message
      }
    }
    
    // 检查 3: 用户数据
    try {
      const adminUser = await prisma.user.findUnique({
        where: { email: 'admin@yourcompany.com' },
        include: { department: true }
      })
      results.checks.user = {
        exists: !!adminUser,
        isActive: adminUser?.isActive || false,
        hasDepartment: !!adminUser?.departmentId,
        departmentName: adminUser?.department?.name || null
      }
    } catch (userError: any) {
      results.checks.user = {
        exists: false,
        error: userError.message
      }
    }
    
    // 检查 4: NextAuth Session
    try {
      const session = await getServerSession(authOptions)
      results.checks.session = {
        exists: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id || null,
        userEmail: session?.user?.email || null,
        departmentName: session?.user?.departmentName || null
      }
    } catch (sessionError: any) {
      results.checks.session = {
        exists: false,
        error: sessionError.message
      }
    }
    
    // 检查 5: NextAuth 配置
    results.checks.config = {
      hasAuthOptions: !!authOptions,
      hasProviders: !!authOptions.providers && authOptions.providers.length > 0,
      hasCallbacks: !!authOptions.callbacks,
      sessionStrategy: authOptions.session?.strategy || '未设置'
    }
    
    // 总结
    const allChecks = [
      results.checks.env.hasNextAuthSecret,
      results.checks.env.hasNextAuthUrl,
      results.checks.database?.connected,
      results.checks.user?.exists,
      results.checks.user?.isActive
    ]
    
    results.summary = {
      allPassed: allChecks.every(check => check === true),
      passedCount: allChecks.filter(check => check === true).length,
      totalCount: allChecks.length
    }
    
    return NextResponse.json(results, {
      status: results.summary.allPassed ? 200 : 500
    })
    
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
