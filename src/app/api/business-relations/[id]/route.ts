import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function toRelation(row: any) {
  return {
    id: row.id,
    sourceUID: row.sourceUID,
    targetUID: row.targetUID,
    relationType: row.relationType,
    metadata: row.metadata ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

// GET - 单条
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.businessRelation.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toRelation(row));
  } catch (error: any) {
    console.error('Error fetching business relation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business relation', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.businessRelation.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting business relation:', error);
    return NextResponse.json(
      { error: 'Failed to delete business relation', details: error.message },
      { status: 500 }
    );
  }
}
