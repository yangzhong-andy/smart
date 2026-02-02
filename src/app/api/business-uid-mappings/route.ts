import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 按 oldId 查单条，或按 entityType 查列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const oldId = searchParams.get('oldId');
    const entityType = searchParams.get('entityType');
    const uid = searchParams.get('uid');

    if (oldId) {
      const row = await prisma.businessUidMapping.findUnique({
        where: { oldId },
      });
      if (!row) return NextResponse.json(null);
      return NextResponse.json({
        id: row.id,
        entityType: row.entityType,
        oldId: row.oldId,
        uid: row.uid,
        createdAt: row.createdAt.toISOString(),
      });
    }

    const where: { entityType?: string; uid?: string } = {};
    if (entityType) where.entityType = entityType;
    if (uid) where.uid = uid;

    const list = await prisma.businessUidMapping.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      list.map((row) => ({
        id: row.id,
        entityType: row.entityType,
        oldId: row.oldId,
        uid: row.uid,
        createdAt: row.createdAt.toISOString(),
      }))
    );
  } catch (error: any) {
    console.error('Error fetching business UID mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business UID mappings', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建或按 oldId 更新映射（upsert）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityType, oldId, uid } = body;

    if (!oldId || !uid) {
      return NextResponse.json(
        { error: 'oldId, uid 不能为空' },
        { status: 400 }
      );
    }

    const row = await prisma.businessUidMapping.upsert({
      where: { oldId: String(oldId) },
      create: {
        entityType: (entityType && String(entityType).trim()) || 'OTHER',
        oldId: String(oldId),
        uid: String(uid),
      },
      update: {
        entityType: (entityType && String(entityType).trim()) || undefined,
        uid: String(uid),
      },
    });

    return NextResponse.json(
      {
        id: row.id,
        entityType: row.entityType,
        oldId: row.oldId,
        uid: row.uid,
        createdAt: row.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error upserting business UID mapping:', error);
    return NextResponse.json(
      { error: 'Failed to upsert business UID mapping', details: error.message },
      { status: 500 }
    );
  }
}
