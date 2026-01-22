import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { CashFlowType, CashFlowStatus } from '@prisma/client'

// PUT - 更新流水
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const body = await request.json()
    
    const updated = await prisma.cashFlow.update({
      where: { id },
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

// DELETE - 删除流水
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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
