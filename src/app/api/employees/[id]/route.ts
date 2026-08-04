import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { DepartmentEnum, EmploymentStatus } from '@prisma/client'

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
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const body = await request.json()

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
    if (body.bankAccount !== undefined) updateData.bankAccount = body.bankAccount || null
    if (body.bankName !== undefined) updateData.bankName = body.bankName || null
    if (body.idNumber !== undefined) updateData.idNumber = body.idNumber || null
    if (body.baseSalary !== undefined) updateData.baseSalary = Number(body.baseSalary)
    if (body.positionSalary !== undefined) updateData.positionSalary = Number(body.positionSalary)
    if (body.fullAttendanceBonus !== undefined) updateData.fullAttendanceBonus = Number(body.fullAttendanceBonus)
    if (body.pensionInsurance !== undefined) updateData.pensionInsurance = Number(body.pensionInsurance)
    if (body.unemploymentInsurance !== undefined) updateData.unemploymentInsurance = Number(body.unemploymentInsurance)
    if (body.medicalInsurance !== undefined) updateData.medicalInsurance = Number(body.medicalInsurance)

    const employee = await prisma.employee.update({
      where: { id: params.id },
      data: updateData
    })

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
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    await prisma.employee.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete employee' },
      { status: 500 }
    )
  }
}
