import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取单个佣金记录
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const record = await prisma.commissionRecord.findUnique({
      where: { id: params.id },
      include: {
        employee: true,
        rule: true
      }
    })

    if (!record) {
      return NextResponse.json(
        { error: 'Commission record not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: record.id,
      employeeId: record.employeeId,
      ruleId: record.ruleId,
      periodLabel: record.periodLabel,
      amount: Number(record.amount),
      currency: record.currency,
      details: record.details ? JSON.parse(JSON.stringify(record.details)) : undefined,
      generatedAt: record.generatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching commission record:', error)
    return NextResponse.json(
      { error: 'Failed to fetch commission record' },
      { status: 500 }
    )
  }
}

// DELETE - 删除佣金记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.commissionRecord.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting commission record:', error)
    return NextResponse.json(
      { error: 'Failed to delete commission record' },
      { status: 500 }
    )
  }
}
