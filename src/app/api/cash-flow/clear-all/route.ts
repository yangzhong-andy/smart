import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// DELETE - 删除所有流水记录（用于测试）
export async function DELETE(request: NextRequest) {
  try {
    // 确保数据库连接
    await prisma.$connect().catch(() => {
      // 连接失败时继续尝试，Prisma 会自动重连
    })

    // 删除所有流水记录
    const result = await prisma.cashFlow.deleteMany({})

    // 重置所有账户的余额为初始资金（originalBalance = initialCapital）
    const accounts = await prisma.bankAccount.findMany()
    
    for (const account of accounts) {
      const initialCapital = Number(account.initialCapital || 0)
      await prisma.bankAccount.update({
        where: { id: account.id },
        data: {
          originalBalance: initialCapital,
          rmbBalance: account.currency === 'RMB' 
            ? initialCapital 
            : initialCapital * Number(account.exchangeRate || 1)
        }
      })
    }

    return NextResponse.json({ 
      message: '所有流水记录已删除，账户余额已重置为初始资金',
      deletedCount: result.count,
      accountsReset: accounts.length
    })
  } catch (error: any) {
    console.error('Error clearing cash flows:', error)
    
    // 检查是否是数据库连接错误
    if (error.message?.includes('TLS connection') || 
        error.message?.includes('connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001' ||
        !process.env.DATABASE_URL) {
      return NextResponse.json(
        { 
          error: '数据库连接失败',
          details: process.env.NODE_ENV === 'production' 
            ? '请检查 Vercel 环境变量中的 DATABASE_URL 配置'
            : '请检查 .env.local 中的 DATABASE_URL 配置'
        },
        { status: 503 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to clear cash flows', details: error.message },
      { status: 500 }
    )
  }
}
