import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Department, CommissionRuleType, CommissionPeriod } from '@prisma/client'

// GET - 获取所有佣金规则
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const department = searchParams.get('department')
    const enabled = searchParams.get('enabled')

    const where: any = {}
    if (department) where.department = department as Department
    if (enabled !== null) where.enabled = enabled === 'true'

    const rules = await prisma.commissionRule.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })

    const transformed = rules.map(r => ({
      id: r.id,
      name: r.name,
      department: r.department,
      position: r.position || undefined,
      type: r.type,
      config: r.config ? JSON.parse(JSON.stringify(r.config)) : {},
      dataSource: r.dataSource ? JSON.parse(JSON.stringify(r.dataSource)) : {},
      period: r.period,
      startDate: r.startDate?.toISOString() || undefined,
      endDate: r.endDate?.toISOString() || undefined,
      enabled: r.enabled,
      description: r.description || undefined,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching commission rules:', error)
    return NextResponse.json(
      { error: 'Failed to fetch commission rules' },
      { status: 500 }
    )
  }
}

// POST - 创建新佣金规则
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const rule = await prisma.commissionRule.create({
      data: {
        name: body.name,
        department: body.department as Department,
        position: body.position || null,
        type: body.type as CommissionRuleType,
        config: body.config ? JSON.parse(JSON.stringify(body.config)) : {},
        dataSource: body.dataSource ? JSON.parse(JSON.stringify(body.dataSource)) : {},
        period: body.period as CommissionPeriod,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        enabled: body.enabled !== undefined ? body.enabled : true,
        description: body.description || null
      }
    })

    return NextResponse.json({
      id: rule.id,
      name: rule.name,
      department: rule.department,
      position: rule.position || undefined,
      type: rule.type,
      config: rule.config ? JSON.parse(JSON.stringify(rule.config)) : {},
      dataSource: rule.dataSource ? JSON.parse(JSON.stringify(rule.dataSource)) : {},
      period: rule.period,
      startDate: rule.startDate?.toISOString() || undefined,
      endDate: rule.endDate?.toISOString() || undefined,
      enabled: rule.enabled,
      description: rule.description || undefined,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating commission rule:', error)
    return NextResponse.json(
      { error: 'Failed to create commission rule' },
      { status: 500 }
    )
  }
}
