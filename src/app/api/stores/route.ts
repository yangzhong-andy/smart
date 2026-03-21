import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'
import { badRequest, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const PLATFORM_MAP_DB_TO_FRONT: Record<Platform, string> = {
  [Platform.TIKTOK]: 'TikTok',
  [Platform.AMAZON]: 'Amazon',
  [Platform.INSTAGRAM]: 'Instagram',
  [Platform.YOUTUBE]: 'YouTube',
  [Platform.OTHER]: '其他'
};

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'stores';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');
    const country = searchParams.get('country');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');
    const noCache = searchParams.get('noCache') === 'true';

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      platform || 'all',
      country || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (platform) where.platform = platform as Platform;

    const [stores, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        select: {
          id: true, name: true, platform: true, country: true,
          currency: true, accountId: true, accountName: true,
          vatNumber: true, taxId: true, createdAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.store.count({ where }),
    ]);

    const response = {
      data: stores.map(s => ({
        id: s.id,
        name: s.name,
        platform: PLATFORM_MAP_DB_TO_FRONT[s.platform] as 'TikTok' | 'Amazon' | 'Instagram' | 'YouTube' | '其他',
        country: s.country || undefined,
        currency: s.currency || undefined,
        accountId: s.accountId || undefined,
        accountName: s.accountName || undefined,
        vatNumber: s.vatNumber || undefined,
        taxId: s.taxId || undefined,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error) {
    return serverError('Failed to fetch stores')
  }
}

// POST - 创建新店铺（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.name || !String(body.name).trim()) {
      return badRequest('店铺名称不能为空')
    }
    if (!body.country || !String(body.country).trim()) {
      return badRequest('请选择国家/站点')
    }

    const PLATFORM_MAP_FRONT_TO_DB: Record<string, Platform> = {
      'TikTok': Platform.TIKTOK,
      'Amazon': Platform.AMAZON,
      'Instagram': Platform.INSTAGRAM,
      'YouTube': Platform.YOUTUBE,
      '其他': Platform.OTHER
    };

    // accountId / accountName 在 schema 中为必填 String（非 String?），未关联账户时必须用空字符串，不能传 null
    const store = await prisma.store.create({
      data: {
        name: String(body.name ?? '').trim(),
        platform: PLATFORM_MAP_FRONT_TO_DB[body.platform] || Platform.OTHER,
        country: String(body.country ?? '').trim(),
        currency: body.currency || 'USD',
        accountId: body.accountId ? String(body.accountId) : '',
        accountName: body.accountName ? String(body.accountName) : '',
        vatNumber: body.vatNumber || null,
        taxId: body.taxId || null,
      }
    });

    // 清除店铺相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: store.id,
      name: store.name,
      platform: PLATFORM_MAP_DB_TO_FRONT[store.platform],
      createdAt: store.createdAt.toISOString()
    });
  } catch (error) {
    console.error('[POST /api/stores]', error)
    return serverError('创建店铺失败，请检查是否重复名称或数据库约束', error, {
      includeDetailsInDev: true,
    })
  }
}

// DELETE - 删除店铺（需 ADMIN 或 MANAGER，通过 query id 指定）
export async function DELETE(request: NextRequest) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return badRequest('缺少店铺 id')
    }
    await prisma.store.delete({ where: { id } })
    await clearCacheByPrefix(CACHE_KEY_PREFIX)
    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError('Failed to delete store')
  }
}
