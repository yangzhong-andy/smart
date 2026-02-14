import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis';

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

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'business-relations';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceUID = searchParams.get('sourceUID');
    const targetUID = searchParams.get('targetUID');
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      sourceUID || 'all',
      targetUID || 'all'
    );

    // 尝试从缓存获取
    if (!noCache && !sourceUID && !targetUID) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Business relations cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (sourceUID) where.sourceUID = sourceUID;
    if (targetUID) where.targetUID = targetUID;

    const list = await prisma.businessRelation.findMany({
      where: Object.keys(where).length ? where : undefined,
      select: {
        id: true, sourceUID: true, targetUID: true,
        relationType: true, metadata: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    const response = list.map(toRelation);

    // 设置缓存（仅在无筛选条件时）
    if (!noCache && !sourceUID && !targetUID) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching business relations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch business relations', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建（清除缓存）
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

    // 检查是否已存在
    const existing = await prisma.businessRelation.findUnique({
      where: {
        sourceUID_targetUID_relationType: {
          sourceUID: String(sourceUID),
          targetUID: String(targetUID),
          relationType: String(relationType),
        }
      }
    });

    if (existing) {
      return NextResponse.json({ message: '关系已存在', id: existing.id });
    }

    const relation = await prisma.businessRelation.create({
      data: {
        sourceUID: String(sourceUID),
        targetUID: String(targetUID),
        relationType: String(relationType),
        metadata: metadata ? JSON.stringify(metadata) : null,
      }
    });

    // 清除业务关系缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json(toRelation(relation));
  } catch (error: any) {
    console.error('Error creating business relation:', error);
    return NextResponse.json(
      { error: 'Failed to create business relation', details: error.message },
      { status: 500 }
    );
  }
}
