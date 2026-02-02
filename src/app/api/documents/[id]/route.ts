import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function toDoc(row: any) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    name: row.name,
    type: row.type,
    fileUrl: row.fileUrl ?? undefined,
    uploadDate: row.uploadDate.toISOString().split('T')[0],
    uploadedBy: row.uploadedBy ?? undefined,
    notes: row.notes ?? undefined
  };
}

// GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.document.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toDoc(row));
  } catch (error: any) {
    console.error('Error fetching document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document', details: error.message },
      { status: 500 }
    );
  }
}

// PUT
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { entityType, entityId, name, type, fileUrl, uploadDate, uploadedBy, notes } = body;

    const updateData: Record<string, any> = {};
    if (entityType === 'factory' || entityType === 'order') updateData.entityType = entityType;
    if (entityId != null) updateData.entityId = String(entityId);
    if (name != null) updateData.name = String(name).trim();
    if (['contract', 'invoice', 'packing_list', 'other'].includes(type)) updateData.type = type;
    if (fileUrl !== undefined) updateData.fileUrl = fileUrl ? String(fileUrl) : null;
    if (uploadDate != null) updateData.uploadDate = new Date(uploadDate);
    if (uploadedBy !== undefined) updateData.uploadedBy = uploadedBy ? String(uploadedBy) : null;
    if (notes !== undefined) updateData.notes = notes ? String(notes) : null;

    const row = await prisma.document.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(toDoc(row));
  } catch (error: any) {
    console.error('Error updating document:', error);
    return NextResponse.json(
      { error: 'Failed to update document', details: error.message },
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
    await prisma.document.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return NextResponse.json(
      { error: 'Failed to delete document', details: error.message },
      { status: 500 }
    );
  }
}
