import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CashFlowStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET - 查询账户余额详情
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    
    // 查找账户
    const account = await prisma.bankAccount.findUnique({
      where: { id }
    })

    if (!account) {
      return NextResponse.json(
        { error: '账户不存在' },
        { status: 404 }
      )
    }

    // 查询该账户的所有已确认流水（含冲销记录，冲销金额为反向，参与余额计算）
    const cashFlows = await prisma.cashFlow.findMany({
      where: {
        accountId: id,
        status: CashFlowStatus.CONFIRMED
      },
      orderBy: {
        date: 'asc'
      }
    })

    // 计算余额
    let calculatedBalance = Number(account.initialCapital || 0);
    const flowDetails = cashFlows.map((flow) => {
      const amount = Number(flow.amount);
      const beforeBalance = calculatedBalance;
      calculatedBalance += amount;
      
      return {
        id: flow.id,
        date: flow.createdAt.toISOString(), // 使用 createdAt 的完整时间
        type: flow.type === 'INCOME' ? 'INCOME' : flow.type === 'EXPENSE' ? 'EXPENSE' : 'TRANSFER',
        category: flow.category,
        summary: flow.summary,
        amount: amount,
        beforeBalance: beforeBalance,
        afterBalance: calculatedBalance,
        remark: flow.remark,
        relatedId: flow.relatedId || undefined
      };
    });

    // 查询内部划拨记录
    const transfers = cashFlows.filter(f => f.category === '内部划拨');
    const transferGroups = new Map<string, typeof cashFlows>();
    transfers.forEach(transfer => {
      if (transfer.relatedId) {
        if (!transferGroups.has(transfer.relatedId)) {
          transferGroups.set(transfer.relatedId, []);
        }
        transferGroups.get(transfer.relatedId)!.push(transfer);
      }
    });

    return NextResponse.json({
      account: {
        id: account.id,
        name: account.name,
        currency: account.currency,
        initialCapital: Number(account.initialCapital || 0),
        originalBalance: Number(account.originalBalance || 0),
        rmbBalance: Number(account.rmbBalance || 0),
        accountCategory: account.accountCategory,
        parentId: account.parentId || undefined
      },
      calculation: {
        startBalance: Number(account.initialCapital || 0),
        calculatedBalance: calculatedBalance,
        databaseBalance: Number(account.originalBalance || 0),
        totalBalance: Number(account.initialCapital || 0) + Number(account.originalBalance || 0),
        isMatch: Math.abs(calculatedBalance - Number(account.originalBalance || 0)) < 0.01
      },
      flows: {
        total: cashFlows.length,
        details: flowDetails
      },
      transfers: {
        count: transfers.length,
        groups: Array.from(transferGroups.entries()).map(([relatedId, flows]) => ({
          relatedId,
          flows: flows.map(f => ({
            id: f.id,
            date: f.createdAt.toISOString(), // 使用 createdAt 的完整时间
            type: f.type,
            amount: Number(f.amount),
            summary: f.summary
          }))
        }))
      }
    })
  } catch (error: any) {
    console.error('Error checking account balance:', error)
    return NextResponse.json(
      { error: '查询失败', details: error.message },
      { status: 500 }
    )
  }
}
