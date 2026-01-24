import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    // 测试数据库连接
    let userCount = 0
    let adminUser = null
    let dbError = null
    
    try {
      userCount = await prisma.user.count()
      adminUser = await prisma.user.findUnique({
        where: { email: 'admin@yourcompany.com' },
        include: { department: true }
      })
    } catch (dbErr: any) {
      dbError = dbErr.message
      console.error('Database error:', dbErr)
    }
    
    // 测试 NextAuth session
    let session = null
    let sessionError = null
    
    try {
      session = await getServerSession(authOptions)
    } catch (authErr: any) {
      sessionError = authErr.message
      console.error('NextAuth error:', authErr)
    }
    
    return NextResponse.json({
      success: true,
      database: {
        connected: !dbError,
        error: dbError,
        userCount,
        adminUser: adminUser ? {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
          department: adminUser.department?.name || null,
          isActive: adminUser.isActive
        } : null
      },
      nextAuth: {
        hasSession: !!session,
        error: sessionError,
        session: session ? {
          user: {
            id: session.user?.id,
            email: session.user?.email,
            name: session.user?.name,
            role: session.user?.role,
            departmentId: session.user?.departmentId,
            departmentName: session.user?.departmentName
          }
        } : null
      },
      env: {
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
        nodeEnv: process.env.NODE_ENV
      },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Test auth error:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
