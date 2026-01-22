import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Department, CommissionRuleType, CommissionPeriod } from '@prisma/client'

// GET - 获取单个佣金规则
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const rule = await prisma.commissionRule.findUnique({
      where: { id: params.id }
    })

    if (!rule) {
      return NextResponse.json(
        { error: 'Commission rule not found' },
        { status: 404 }
      )
    }

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
    })
  } catch (error) {
    console.error('Error fetching commission rule:', error)
    return NextResponse.json(
      { error: 'Failed to fetch commission rule' },
      { status: 500 }
    )
  }
}

// PUT - 更新佣金规则
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.department !== undefined) updateData.department = body.department as Department
    if (body.position !== undefined) updateData.position = body.position || null
    if (body.type !== undefined) updateData.type = body.type as CommissionRuleType
    if (body.config !== undefined) updateData.config = JSON.parse(JSON.stringify(body.config))
    if (body.dataSource !== undefined) updateData.dataSource = JSON.parse(JSON.stringify(body.dataSource))
    if (body.period !== undefined) updateData.period = body.period as CommissionPeriod
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null
    if (body.enabled !== undefined) updateData.enabled = body.enabled
    if (body.description !== undefined) updateData.description = body.description || null

    const rule = await prisma.commissionRule.update({
      where: { id: params.id },
      data: updateData
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
    })
  } catch (error) {
    console.error('Error updating commission rule:', error)
    return NextResponse.json(
      { error: 'Failed to update commission rule' },
      { status: 500 }
    )
  }
}

// DELETE - 删除佣金规则
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.commissionRule.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting commission rule:', error)
    return NextResponse.json(
      { error: 'Failed to delete commission rule' },
      { status: 500 }
    )
  }
}
