import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { CashFlowType, CashFlowStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// PUT - 更新流水
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()
    
    const toVoucherStr = (v: unknown): string | null => {
      if (!v) return null;
      if (Array.isArray(v)) return JSON.stringify(v);
      if (typeof v === 'string') return v;
      return null;
    };
    const paymentVoucherVal = body.paymentVoucher !== undefined ? toVoucherStr(body.paymentVoucher) : null;
    const transferVoucherVal = body.transferVoucher !== undefined ? toVoucherStr(body.transferVoucher) : null;
    const voucherVal = body.voucher !== undefined ? toVoucherStr(body.voucher) : (paymentVoucherVal ?? transferVoucherVal);
    
    const updated = await prisma.cashFlow.update({
      where: { id },
      data: {
        uid: body.uid ?? undefined,
        date: new Date(body.date),
        summary: body.summary,
        category: body.category,
        type: body.type === 'income' ? CashFlowType.INCOME : body.type === 'expense' ? CashFlowType.EXPENSE : CashFlowType.TRANSFER,
        amount: Number(body.amount),
        accountId: body.accountId,
        accountName: body.accountName,
        currency: body.currency || 'CNY',
        remark: body.remark ?? '',
        relatedId: body.relatedId ?? null,
        businessNumber: body.businessNumber ?? null,
        status: body.status === 'confirmed' ? CashFlowStatus.CONFIRMED : CashFlowStatus.PENDING,
        isReversal: body.isReversal ?? false,
        reversedById: body.reversedById ?? null,
        voucher: voucherVal,
        paymentVoucher: paymentVoucherVal,
        transferVoucher: transferVoucherVal,
        updatedAt: new Date()
      },
      include: {
        account: true
      }
    })
    
    // 转换返回格式
    const transformed = {
      id: updated.id,
      uid: updated.uid || undefined,
      date: updated.date.toISOString(),
      summary: updated.summary,
      category: updated.category,
      type: updated.type === CashFlowType.INCOME ? 'income' as const : updated.type === CashFlowType.EXPENSE ? 'expense' as const : 'transfer' as const,
      amount: Number(updated.amount),
      accountId: updated.accountId,
      accountName: updated.accountName,
      currency: updated.currency,
      remark: updated.remark,
      relatedId: updated.relatedId || undefined,
      businessNumber: updated.businessNumber || undefined,
      status: updated.status === CashFlowStatus.CONFIRMED ? 'confirmed' as const : 'pending' as const,
      isReversal: updated.isReversal,
      reversedById: updated.reversedById || undefined,
      voucher: updated.voucher || undefined,
      paymentVoucher: updated.paymentVoucher ?? updated.voucher ?? undefined,
      transferVoucher: updated.transferVoucher ?? undefined,
      createdAt: updated.createdAt.toISOString()
    }
    
    return NextResponse.json(transformed)
  } catch (error) {
    console.error(`Error updating cash flow ${params.id}:`, error)
    return NextResponse.json(
      { error: `Failed to update cash flow ${params.id}` },
      { status: 500 }
    )
  }
}

// PATCH - 仅更新凭证（用于补充付款凭证/转账凭证）
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()
    
    const toVoucherStr = (v: unknown): string | null => {
      if (!v) return null;
      if (Array.isArray(v)) return JSON.stringify(v);
      if (typeof v === 'string') return v;
      return null;
    };
    
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (body.paymentVoucher !== undefined) data.paymentVoucher = toVoucherStr(body.paymentVoucher);
    if (body.transferVoucher !== undefined) data.transferVoucher = toVoucherStr(body.transferVoucher);
    if (!('paymentVoucher' in data) && !('transferVoucher' in data)) {
      return NextResponse.json({ error: '请提供 paymentVoucher 或 transferVoucher' }, { status: 400 });
    }
    
    const updated = await prisma.cashFlow.update({
      where: { id },
      data: data as Parameters<typeof prisma.cashFlow.update>[0]['data'],
      include: { account: true }
    })
    
    const transformed = {
      id: updated.id,
      uid: updated.uid || undefined,
      date: updated.date.toISOString(),
      summary: updated.summary,
      category: updated.category,
      type: updated.type === CashFlowType.INCOME ? 'income' as const : updated.type === CashFlowType.EXPENSE ? 'expense' as const : 'transfer' as const,
      amount: Number(updated.amount),
      accountId: updated.accountId,
      accountName: updated.accountName,
      currency: updated.currency,
      remark: updated.remark,
      relatedId: updated.relatedId || undefined,
      businessNumber: updated.businessNumber || undefined,
      status: updated.status === CashFlowStatus.CONFIRMED ? 'confirmed' as const : 'pending' as const,
      isReversal: updated.isReversal,
      reversedById: updated.reversedById || undefined,
      voucher: updated.voucher || undefined,
      paymentVoucher: updated.paymentVoucher ?? updated.voucher ?? undefined,
      transferVoucher: updated.transferVoucher ?? undefined,
      createdAt: updated.createdAt.toISOString()
    }
    
    return NextResponse.json(transformed)
  } catch (error) {
    console.error(`Error patching cash flow ${params.id}:`, error)
    return NextResponse.json(
      { error: `Failed to update cash flow ${params.id}` },
      { status: 500 }
    )
  }
}

// DELETE - 删除流水
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { id } = params
    
    await prisma.cashFlow.delete({
      where: { id }
    })
    
    return NextResponse.json({ message: 'Cash flow deleted successfully' })
  } catch (error) {
    console.error(`Error deleting cash flow ${params.id}:`, error)
    return NextResponse.json(
      { error: `Failed to delete cash flow ${params.id}` },
      { status: 500 }
    )
  }
}
