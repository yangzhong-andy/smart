import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// 健康检查和数据库连接诊断
export async function GET() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    databaseUrl: {
      exists: !!process.env.DATABASE_URL,
      length: process.env.DATABASE_URL?.length || 0,
      startsWith: process.env.DATABASE_URL?.substring(0, 20) || 'N/A',
    },
    prisma: {
      initialized: !!prisma,
    },
    tests: {
      connection: null as any,
      query: null as any,
    },
    errors: [] as string[],
  }

  // 测试 1: 数据库连接
  try {
    await prisma.$connect()
    diagnostics.tests.connection = {
      success: true,
      message: '数据库连接成功',
    }
  } catch (error: any) {
    diagnostics.tests.connection = {
      success: false,
      error: error.message,
      code: error.code,
    }
    diagnostics.errors.push(`连接错误: ${error.message}`)
  }

  // 测试 2: 简单查询（如果连接成功）
  if (diagnostics.tests.connection.success) {
    try {
      // 尝试查询一个简单的表
      const tableCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
      const count = (tableCount as any[])[0]?.count
      // 处理 BigInt，转换为字符串
      const countValue = typeof count === 'bigint' ? count.toString() : Number(count) || 0
      diagnostics.tests.query = {
        success: true,
        message: '查询成功',
        tableCount: countValue,
      }
    } catch (error: any) {
      diagnostics.tests.query = {
        success: false,
        error: error.message,
        code: error.code,
      }
      diagnostics.errors.push(`查询错误: ${error.message}`)
    }
  }

  // 测试 3: 检查特定表是否存在
  if (diagnostics.tests.query?.success) {
    try {
      const productCount = await prisma.product.count()
      // 确保 count 是数字类型
      diagnostics.tests.productTable = {
        exists: true,
        recordCount: Number(productCount),
      }
    } catch (error: any) {
      diagnostics.tests.productTable = {
        exists: false,
        error: error.message,
      }
      diagnostics.errors.push(`Product 表错误: ${error.message}`)
    }
  }

  const status = diagnostics.tests.connection.success && diagnostics.tests.query?.success ? 200 : 503

  return NextResponse.json(diagnostics, { status })
}
