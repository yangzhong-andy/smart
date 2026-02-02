import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

// GET - 获取关联（支持 sourceUID、targetUID 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceUID = searchParams.get('sourceUID');
    const targetUID = searchParams.get('targetUID');

    const where: { sourceUID?: string; targetUID?: string } = {};
    if (sourceUID) where.sourceUID = sourceUID;
    if (targetUID) where.targetUID = targetUID;

    const list = await prisma.businessRelation.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(list.map(toRelation));
  } catch (error: any) {
    console.error('Error fetching business relations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business relations', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建（若 sourceUID+targetUID+relationType 已存在则忽略）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceUID, targetUID, relationType, metadata } = body;

    if (!sourceUID || !targetUID || !relationType) {
      return NextResponse.json(
        { error: 'sourceUID, targetUID, relationType 不能为空' },
        { status: 400 }
      );
    }

    const existing = await prisma.businessRelation.findUnique({
      where: {
        sourceUID_targetUID_relationType: {
          sourceUID: String(sourceUID),
          targetUID: String(targetUID),
          relationType: String(relationType)
        }
      }
    });

    if (existing) {
      return NextResponse.json(toRelation(existing), { status: 200 });
    }

    const row = await prisma.businessRelation.create({
      data: {
        sourceUID: String(sourceUID),
        targetUID: String(targetUID),
        relationType: String(relationType),
        metadata: metadata && typeof metadata === 'object' ? metadata : null
      }
    });

    return NextResponse.json(toRelation(row), { status: 201 });
  } catch (error: any) {
    console.error('Error creating business relation:', error);
    return NextResponse.json(
      { error: 'Failed to create business relation', details: error.message },
      { status: 500 }
    );
  }
}
