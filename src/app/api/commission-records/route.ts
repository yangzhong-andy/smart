import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取所有佣金记录
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const ruleId = searchParams.get('ruleId')
    const periodLabel = searchParams.get('periodLabel')

    const where: any = {}
    if (employeeId) where.employeeId = employeeId
    if (ruleId) where.ruleId = ruleId
    if (periodLabel) where.periodLabel = periodLabel

    const records = await prisma.commissionRecord.findMany({
      where,
      include: {
        employee: true,
        rule: true
      },
      orderBy: { generatedAt: 'desc' }
    })

    const transformed = records.map(r => ({
      id: r.id,
      employeeId: r.employeeId,
      ruleId: r.ruleId,
      periodLabel: r.periodLabel,
      amount: Number(r.amount),
      currency: r.currency,
      details: r.details ? JSON.parse(JSON.stringify(r.details)) : undefined,
      generatedAt: r.generatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching commission records:', error)
    return NextResponse.json(
      { error: 'Failed to fetch commission records' },
      { status: 500 }
    )
  }
}

// POST - 创建新佣金记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const record = await prisma.commissionRecord.create({
      data: {
        employeeId: body.employeeId,
        ruleId: body.ruleId,
        periodLabel: body.periodLabel,
        amount: Number(body.amount),
        currency: body.currency || 'CNY',
        details: body.details ? JSON.parse(JSON.stringify(body.details)) : null
      }
    })

    return NextResponse.json({
      id: record.id,
      employeeId: record.employeeId,
      ruleId: record.ruleId,
      periodLabel: record.periodLabel,
      amount: Number(record.amount),
      currency: record.currency,
      details: record.details ? JSON.parse(JSON.stringify(record.details)) : undefined,
      generatedAt: record.generatedAt.toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating commission record:', error)
    return NextResponse.json(
      { error: 'Failed to create commission record' },
      { status: 500 }
    )
  }
}
