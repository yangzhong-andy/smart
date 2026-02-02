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

// GET - 获取文档（支持 entityType、entityId 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');

    const where: { entityType?: 'factory' | 'order'; entityId?: string } = {};
    if (entityType === 'factory' || entityType === 'order') where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const list = await prisma.document.findMany({
      where,
      orderBy: { uploadDate: 'desc' }
    });

    return NextResponse.json(list.map(toDoc));
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, entityId, name, type, fileUrl, uploadDate, uploadedBy, notes } = body;

    if (!entityType || !entityId || !name || !type) {
      return NextResponse.json(
        { error: 'entityType, entityId, name, type 不能为空' },
        { status: 400 }
      );
    }

    const validEntity = entityType === 'factory' || entityType === 'order';
    const validType = ['contract', 'invoice', 'packing_list', 'other'].includes(type);
    if (!validEntity || !validType) {
      return NextResponse.json(
        { error: 'entityType 须为 factory|order，type 须为 contract|invoice|packing_list|other' },
        { status: 400 }
      );
    }

    const row = await prisma.document.create({
      data: {
        entityType: entityType as 'factory' | 'order',
        entityId: String(entityId),
        name: String(name).trim(),
        type: type as 'contract' | 'invoice' | 'packing_list' | 'other',
        fileUrl: fileUrl ? String(fileUrl) : null,
        uploadDate: uploadDate ? new Date(uploadDate) : new Date(),
        uploadedBy: uploadedBy ? String(uploadedBy) : null,
        notes: notes ? String(notes) : null
      }
    });

    return NextResponse.json(toDoc(row), { status: 201 });
  } catch (error: any) {
    console.error('Error creating document:', error);
    return NextResponse.json(
      { error: 'Failed to create document', details: error.message },
      { status: 500 }
    );
  }
}
