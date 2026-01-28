import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CashFlowType, CashFlowStatus } from '@prisma/client'

// GET - 获取所有流水
export async function GET(request: NextRequest) {
  try {
    // 优化：移除手动连接，Prisma 会自动管理连接池

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
    
    // 处理 voucher 字段：如果是数组，转换为 JSON 字符串；如果是字符串，直接使用；否则为 null
    let voucherValue: string | null = null;
    if (body.voucher) {
      if (Array.isArray(body.voucher)) {
        voucherValue = JSON.stringify(body.voucher);
      } else if (typeof body.voucher === 'string') {
        voucherValue = body.voucher;
      }
    }
    
    // 验证必填字段
    if (!body.date || !body.summary || !body.category || !body.type || body.amount === undefined || !body.accountId || !body.accountName) {
      return NextResponse.json(
        { 
          error: '创建失败：缺少必填字段',
          details: '请确保 date, summary, category, type, amount, accountId, accountName 都已提供'
        },
        { status: 400 }
      )
    }
    
    // 创建流水记录
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
        voucher: voucherValue,
        // createdAt 和 updatedAt 由 Prisma 自动处理，不需要手动传入
      },
      include: {
        account: true
      }
    })
    
    // 更新账户余额（仅当状态为已确认时）
    if (body.status === 'confirmed') {
      const account = await prisma.bankAccount.findUnique({
        where: { id: body.accountId }
      })
      
      if (account) {
        // 计算新的余额：当前余额 + 流水金额（收入为正，支出为负）
        const newBalance = Number(account.originalBalance) + Number(body.amount)
        
        // 更新账户余额
        await prisma.bankAccount.update({
          where: { id: body.accountId },
          data: {
            originalBalance: newBalance,
            rmbBalance: account.currency === 'CNY' || account.currency === 'RMB' 
              ? newBalance 
              : newBalance * Number(account.exchangeRate)
          }
        })
      }
    }
    
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
  } catch (error: any) {
    console.error('Error creating cash flow:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack
    })
    
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
    
    // 检查是否是字段验证错误
    if (error.code === 'P2002') {
      return NextResponse.json(
        { 
          error: '创建失败：数据唯一性冲突',
          details: error.meta?.target ? `字段 ${error.meta.target} 已存在` : '数据已存在'
        },
        { status: 400 }
      )
    }
    
    if (error.code === 'P2003') {
      return NextResponse.json(
        { 
          error: '创建失败：关联数据不存在',
          details: error.meta?.field_name ? `关联的 ${error.meta.field_name} 不存在` : '关联数据不存在'
        },
        { status: 400 }
      )
    }
    
    // 检查是否是必填字段缺失
    if (error.code === 'P2011' || error.message?.includes('required') || error.message?.includes('Missing')) {
      return NextResponse.json(
        { 
          error: '创建失败：必填字段缺失',
          details: error.message || '请检查所有必填字段是否已提供'
        },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create cash flow',
        details: error.message || '未知错误',
        code: error.code || 'UNKNOWN',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}
