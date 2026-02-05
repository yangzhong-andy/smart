import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - 获取单条部门
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dept = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true, employees: true } } },
    });
    if (!dept) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      id: dept.id,
      name: dept.name,
      code: dept.code,
      description: dept.description,
      isActive: dept.isActive,
      createdAt: dept.createdAt.toISOString(),
      updatedAt: dept.updatedAt.toISOString(),
      userCount: dept._count.users,
      employeeCount: dept._count.employees,
    });
  } catch (error: any) {
    console.error('Error fetching department:', error);
    return NextResponse.json(
      { error: 'Failed to fetch department', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新部门
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, code, description, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (name != null) updateData.name = String(name).trim();
    if (code !== undefined) updateData.code = code ? String(code).trim() : null;
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const dept = await prisma.department.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: dept.id,
      name: dept.name,
      code: dept.code,
      description: dept.description,
      isActive: dept.isActive,
      createdAt: dept.createdAt.toISOString(),
      updatedAt: dept.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating department:', error);
    return NextResponse.json(
      { error: 'Failed to update department', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除部门（若无关联用户/员工）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dept = await prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true, employees: true } } },
    });
    if (!dept) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dept._count.users > 0 || dept._count.employees > 0) {
      return NextResponse.json(
        { error: '该部门下存在用户或员工，无法删除' },
        { status: 400 }
      );
    }
    await prisma.department.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting department:', error);
    return NextResponse.json(
      { error: 'Failed to delete department', details: error.message },
      { status: 500 }
    );
  }
}
