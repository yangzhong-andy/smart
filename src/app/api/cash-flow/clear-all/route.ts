import { NextRequest, NextResponse } from 'next/server'
import { clearCacheByPrefix } from "@/lib/redis";
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// DELETE - 删除所有流水记录（仅 SUPER_ADMIN 可用）
export async function DELETE(request: NextRequest) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
    await clearCacheByPrefix("cash-flow");
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    if (session.user?.role !== 'SUPER_ADMIN') {
    await clearCacheByPrefix("cash-flow");
      return NextResponse.json({ error: '仅超级管理员可执行此操作' }, { status: 403 })
    }

    // 删除所有流水记录
    const result = await prisma.cashFlow.deleteMany({})

    // 重置所有账户的余额为初始资金
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

    await clearCacheByPrefix("cash-flow");
    return NextResponse.json({ 
      message: '所有流水记录已删除，账户余额已重置为初始资金',
      deletedCount: result.count,
      accountsReset: accounts.length
    })
  } catch (error: any) {
    console.error('[cash-flow/clear-all]', error)
    await clearCacheByPrefix("cash-flow");
    return NextResponse.json(
      { error: '操作失败，请稍后重试' },
      { status: 500 }
    )
  }
}
