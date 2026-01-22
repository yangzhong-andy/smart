import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CashFlowType, CashFlowStatus } from '@prisma/client'

// GET - 获取所有流水
export async function GET(request: NextRequest) {
  try {
    // 确保数据库连接
    await prisma.$connect().catch(() => {
      // 连接失败时继续尝试查询，Prisma 会自动重连
    })

    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    
    const where: any = {}
    if (accountId) where.accountId = accountId
    if (type) where.type = type === 'income' ? CashFlowType.INCOME : type === 'expense' ? CashFlowType.EXPENSE : CashFlowType.TRANSFER
    if (status) where.status = status === 'confirmed' ? CashFlowStatus.CONFIRMED : CashFlowStatus.PENDING
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) where.date.gte = new Date(dateFrom)
      if (dateTo) where.date.lte = new Date(dateTo)
    }
    
    const cashFlows = await prisma.cashFlow.findMany({
      where,
      include: {
        account: true
      },
      orderBy: { date: 'desc' }
    })
    
    // 转换格式以匹配前端 CashFlow 类型
    const transformed = cashFlows.map(cf => ({
      id: cf.id,
      uid: cf.uid || undefined,
      date: cf.date.toISOString(),
      summary: cf.summary,
      category: cf.category,
      type: cf.type === CashFlowType.INCOME ? 'income' as const : cf.type === CashFlowType.EXPENSE ? 'expense' as const : 'transfer' as const,
      amount: Number(cf.amount),
      accountId: cf.accountId,
      accountName: cf.accountName,
      currency: cf.currency,
      remark: cf.remark,
      relatedId: cf.relatedId || undefined,
      businessNumber: cf.businessNumber || undefined,
      status: cf.status === CashFlowStatus.CONFIRMED ? 'confirmed' as const : 'pending' as const,
      isReversal: cf.isReversal,
      reversedById: cf.reversedById || undefined,
      voucher: cf.voucher || undefined,
      createdAt: cf.createdAt.toISOString()
    }))
    
    return NextResponse.json(transformed)
  } catch (error: any) {
    console.error('Error fetching cash flows:', error)
    
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
      { error: 'Failed to fetch cash flows', details: error.message },
      { status: 500 }
    )
  }
}

// POST - 创建新流水
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const cashFlow = await prisma.cashFlow.create({
      data: {
        uid: body.uid || null,
        date: new Date(body.date),
        summary: body.summary,
        category: body.category,
        type: body.type === 'income' ? CashFlowType.INCOME : body.type === 'expense' ? CashFlowType.EXPENSE : CashFlowType.TRANSFER,
        amount: Number(body.amount),
        accountId: body.accountId,
        accountName: body.accountName,
        currency: body.currency || 'CNY',
        remark: body.remark || '',
        relatedId: body.relatedId || null,
        businessNumber: body.businessNumber || null,
        status: body.status === 'confirmed' ? CashFlowStatus.CONFIRMED : CashFlowStatus.PENDING,
        isReversal: body.isReversal || false,
        reversedById: body.reversedById || null,
        voucher: body.voucher || null,
      },
      include: {
        account: true
      }
    })
    
    // 转换返回格式
    const transformed = {
      id: cashFlow.id,
      uid: cashFlow.uid || undefined,
      date: cashFlow.date.toISOString(),
      summary: cashFlow.summary,
      category: cashFlow.category,
      type: cashFlow.type === CashFlowType.INCOME ? 'income' as const : cashFlow.type === CashFlowType.EXPENSE ? 'expense' as const : 'transfer' as const,
      amount: Number(cashFlow.amount),
      accountId: cashFlow.accountId,
      accountName: cashFlow.accountName,
      currency: cashFlow.currency,
      remark: cashFlow.remark,
      relatedId: cashFlow.relatedId || undefined,
      businessNumber: cashFlow.businessNumber || undefined,
      status: cashFlow.status === CashFlowStatus.CONFIRMED ? 'confirmed' as const : 'pending' as const,
      isReversal: cashFlow.isReversal,
      reversedById: cashFlow.reversedById || undefined,
      voucher: cashFlow.voucher || undefined,
      createdAt: cashFlow.createdAt.toISOString()
    }
    
    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error('Error creating cash flow:', error)
    return NextResponse.json(
      { error: 'Failed to create cash flow' },
      { status: 500 }
    )
  }
}
