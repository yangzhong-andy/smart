import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DepartmentEnum, EmploymentStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET - 获取所有员工
export async function GET() {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: 'desc' }
    })

    const transformed = employees.map(e => ({
      id: e.id,
      name: e.name,
      employeeNumber: e.employeeNumber || undefined,
      department: e.department,
      position: e.position,
      joinDate: e.joinDate.toISOString(),
      phone: e.phone || undefined,
      email: e.email || undefined,
      status: e.status,
      responsibleInfluencers: e.responsibleInfluencers || [],
      responsibleSuppliers: e.responsibleSuppliers || [],
      responsibleStores: e.responsibleStores || [],
      notes: e.notes || undefined,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

// POST - 创建新员工
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const employee = await prisma.employee.create({
      data: {
        name: body.name,
        employeeNumber: body.employeeNumber || null,
        department: body.department as DepartmentEnum,
        position: body.position,
        joinDate: new Date(body.joinDate),
        phone: body.phone || null,
        email: body.email || null,
        status: (body.status as EmploymentStatus) || EmploymentStatus.ACTIVE,
        responsibleInfluencers: body.responsibleInfluencers || [],
        responsibleSuppliers: body.responsibleSuppliers || [],
        responsibleStores: body.responsibleStores || [],
        notes: body.notes || null
      }
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
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating employee:', error)
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    )
  }
}
