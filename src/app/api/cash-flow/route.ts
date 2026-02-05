import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CashFlowType, CashFlowStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

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
    
    // 转换格式以匹配前端 CashFlow 类型（兼容旧 voucher，映射为 paymentVoucher）
    const transformed = cashFlows.map(cf => {
      const paymentV = cf.paymentVoucher ?? (cf.voucher || undefined);
      const transferV = cf.transferVoucher ?? undefined;
      return {
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
        paymentVoucher: paymentV || undefined,
        transferVoucher: transferV || undefined,
        createdAt: cf.createdAt.toISOString()
      };
    });
    
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
    
    // 处理凭证字段：支持 paymentVoucher、transferVoucher，兼容旧 voucher
    const toVoucherStr = (v: unknown): string | null => {
      if (!v) return null;
      if (Array.isArray(v)) return JSON.stringify(v);
      if (typeof v === 'string') return v;
      return null;
    };
    let paymentVoucherValue = toVoucherStr(body.paymentVoucher);
    let transferVoucherValue = toVoucherStr(body.transferVoucher);
    // 兼容：若只有 voucher，则作为 paymentVoucher
    if (!paymentVoucherValue && body.voucher) {
      paymentVoucherValue = toVoucherStr(body.voucher);
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
        voucher: paymentVoucherValue ?? transferVoucherValue ?? null,
        paymentVoucher: paymentVoucherValue,
        transferVoucher: transferVoucherValue,
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
      paymentVoucher: cashFlow.paymentVoucher ?? cashFlow.voucher ?? undefined,
      transferVoucher: cashFlow.transferVoucher ?? undefined,
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
      const field = error.meta?.field_name as string | undefined;
      const isAccount = field?.toLowerCase().includes('account');
      return NextResponse.json(
        {
          error: '创建失败：关联数据不存在',
          details: isAccount ? '所选账户不存在或已被删除，请重新选择账户' : (field ? `关联的 ${field} 不存在` : '关联数据不存在')
        },
        { status: 400 }
      );
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
    
    // 默认 500：返回中文提示，便于排查
    const detailMsg = error.message || '未知错误';
    const hint = /Unknown arg|Unknown column|does not exist/i.test(detailMsg)
      ? '可能是数据库表结构未同步，请在项目根目录执行：npx prisma db push'
      : detailMsg;
    return NextResponse.json(
      {
        error: '创建流水失败',
        details: hint,
        code: error.code || 'UNKNOWN',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
