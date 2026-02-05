import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - 单条
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.businessUidMapping.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      id: row.id,
      entityType: row.entityType,
      oldId: row.oldId,
      uid: row.uid,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching business UID mapping:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business UID mapping', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除映射
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.businessUidMapping.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting business UID mapping:', error);
    return NextResponse.json(
      { error: 'Failed to delete business UID mapping', details: error.message },
      { status: 500 }
    );
  }
}
