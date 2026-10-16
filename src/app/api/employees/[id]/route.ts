import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DepartmentEnum, EmploymentStatus } from '@prisma/client'
import { clearCacheByPrefix } from '@/lib/redis'
import { parseSalarySettings } from '@/lib/employee-profile'
import { requireApiUser } from '@/lib/api-auth'
import { EMPLOYMENT_DATE_FIELDS, parseEmploymentSettings } from '@/lib/employee-confirmation'

export const dynamic = 'force-dynamic'

// GET - 获取单个员工
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: params.id }
    })

    if (!employee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: employee.id,
      name: employee.name,
      employeeNumber: employee.employeeNumber || undefined,
      department: employee.department,
      position: employee.position,
      joinDate: employee.joinDate.toISOString(),
      phone: employee.phone || undefined,
      email: employee.email || undefined,
      status: employee.status,
      probationStartDate: employee.probationStartDate?.toISOString().slice(0, 10),
      expectedConfirmationDate: employee.expectedConfirmationDate?.toISOString().slice(0, 10),
      confirmationDate: employee.confirmationDate?.toISOString().slice(0, 10),
      responsibleInfluencers: employee.responsibleInfluencers || [],
      responsibleSuppliers: employee.responsibleSuppliers || [],
      responsibleStores: employee.responsibleStores || [],
      notes: employee.notes || undefined,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch employee' },
      { status: 500 }
    )
  }
}

// PUT - 更新员工
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiUser(request, { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] })
    if (auth.response) return auth.response

    const body = await request.json()
    let salary
    let employment = {}
    try {
      salary = parseSalarySettings(body)
      if ([...EMPLOYMENT_DATE_FIELDS, 'joinDate', 'leaveDate', 'status'].some(key => body[key] !== undefined)) {
        const current = await prisma.employee.findUnique({ where: { id: params.id } })
        if (!current) return NextResponse.json({ error: '员工不存在' }, { status: 404 })
        employment = parseEmploymentSettings(body, current)
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '薪资格式不正确' }, { status: 400 })
    }

    // 中文状态 -> EmploymentStatus 映射
    const STATUS_MAP: Record<string, string> = {
      '在职': 'ACTIVE', '试用期': 'PROBATION', '离职': 'INACTIVE',
    };
    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.employeeNumber !== undefined) updateData.employeeNumber = body.employeeNumber || null
    if (body.department !== undefined) updateData.department = body.department
    if (body.position !== undefined) updateData.position = body.position
    if (body.joinDate !== undefined) updateData.joinDate = new Date(body.joinDate)
    if (body.phone !== undefined) updateData.phone = body.phone || null
    if (body.email !== undefined) updateData.email = body.email || null
    if (body.status !== undefined) updateData.status = (STATUS_MAP[body.status] || body.status) as any
    if (body.responsibleInfluencers !== undefined) updateData.responsibleInfluencers = body.responsibleInfluencers || []
    if (body.responsibleSuppliers !== undefined) updateData.responsibleSuppliers = body.responsibleSuppliers || []
    if (body.responsibleStores !== undefined) updateData.responsibleStores = body.responsibleStores || []
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.leaveDate !== undefined) updateData.leaveDate = body.leaveDate ? new Date(body.leaveDate) : null
    Object.assign(updateData, salary)
    Object.assign(updateData, employment)

    const employee = await prisma.employee.update({
      where: { id: params.id },
      data: updateData
    })
    await clearCacheByPrefix('employees')

    return NextResponse.json({
      id: employee.id,
      name: employee.name,
      employeeNumber: employee.employeeNumber || undefined,
      department: employee.department,
      position: employee.position,
      joinDate: employee.joinDate.toISOString(),
      phone: employee.phone || undefined,
      email: employee.email || undefined,
      status: employee.status,
      responsibleInfluencers: employee.responsibleInfluencers || [],
      responsibleSuppliers: employee.responsibleSuppliers || [],
      responsibleStores: employee.responsibleStores || [],
      notes: employee.notes || undefined,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update employee' },
      { status: 500 }
    )
  }
}

// DELETE - 删除员工
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireApiUser(request, { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] })
    if (auth.response) return auth.response

    await prisma.employee.delete({
      where: { id: params.id }
    })
    await clearCacheByPrefix('employees')

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete employee' },
      { status: 500 }
    )
  }
}
