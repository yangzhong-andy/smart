import { NextRequest, NextResponse } from 'next/server'
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
    console.error('Error fetching employee:', error)
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
    const body = await request.json()

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.employeeNumber !== undefined) updateData.employeeNumber = body.employeeNumber || null
    if (body.department !== undefined) updateData.department = body.department as DepartmentEnum
    if (body.position !== undefined) updateData.position = body.position
    if (body.joinDate !== undefined) updateData.joinDate = new Date(body.joinDate)
    if (body.phone !== undefined) updateData.phone = body.phone || null
    if (body.email !== undefined) updateData.email = body.email || null
    if (body.status !== undefined) updateData.status = body.status as EmploymentStatus
    if (body.responsibleInfluencers !== undefined) updateData.responsibleInfluencers = body.responsibleInfluencers || []
    if (body.responsibleSuppliers !== undefined) updateData.responsibleSuppliers = body.responsibleSuppliers || []
    if (body.responsibleStores !== undefined) updateData.responsibleStores = body.responsibleStores || []
    if (body.notes !== undefined) updateData.notes = body.notes || null

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
    console.error('Error updating employee:', error)
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
    await prisma.employee.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting employee:', error)
    return NextResponse.json(
      { error: 'Failed to delete employee' },
      { status: 500 }
    )
  }
}
