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
  [Platform.OTHER]: '\u5176\u4ed6',
}

// cache config
const CACHE_TTL = 300 // 5 minutes
const CACHE_KEY_PREFIX = 'stores'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')
    const country = searchParams.get('country')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')
    const noCache = searchParams.get('noCache') === 'true'

    // build cache key
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      platform || 'all',
      country || 'all',
      String(page),
      String(pageSize)
    )

    // try cache first (page 1 only)
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey)
      if (cached) {
        return NextResponse.json(cached)
      }
    }

    const where: any = {}
    if (platform) where.platform = platform as Platform

    const [stores, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        select: {
          id: true,
          name: true,
          platform: true,
          country: true,
          currency: true,
          accountId: true,
          accountName: true,
          vatNumber: true,
          taxId: true,
          createdAt: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.store.count({ where }),
    ])

    const response = {
      data: stores.map((s) => ({
        id: s.id,
        name: s.name,
        platform: PLATFORM_MAP_DB_TO_FRONT[s.platform] as
          | 'TikTok'
          | 'Amazon'
          | 'Instagram'
          | 'YouTube'
          | '\u5176\u4ed6',
        country: s.country || undefined,
        currency: s.currency || undefined,
        accountId: s.accountId || undefined,
        accountName: s.accountName || undefined,
        vatNumber: s.vatNumber || undefined,
        taxId: s.taxId || undefined,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    }

    // cache page 1 response
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL)
    }

    return NextResponse.json(response)
  } catch {
    return serverError('Failed to fetch stores')
  }
}

// POST - create store and clear cache
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body.name || !String(body.name).trim()) {
      return badRequest('\u5e97\u94fa\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a')
    }
    if (!body.country || !String(body.country).trim()) {
      return badRequest('\u8bf7\u9009\u62e9\u56fd\u5bb6/\u7ad9\u70b9')
    }

    const PLATFORM_MAP_FRONT_TO_DB: Record<string, Platform> = {
      TikTok: Platform.TIKTOK,
      Amazon: Platform.AMAZON,
      Instagram: Platform.INSTAGRAM,
      YouTube: Platform.YOUTUBE,
      '\u5176\u4ed6': Platform.OTHER,
    }

    // accountId/accountName are required String in schema, use empty string instead of null
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
      },
    })

    // clear cache
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({
      id: store.id,
      name: store.name,
      platform: PLATFORM_MAP_DB_TO_FRONT[store.platform],
      createdAt: store.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[POST /api/stores]', error)
    return serverError('\u521b\u5efa\u5e97\u94fa\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u662f\u5426\u91cd\u590d\u540d\u79f0\u6216\u6570\u636e\u5e93\u7ea6\u675f', error, {
      includeDetailsInDev: true,
    })
  }
}

// DELETE - requires SUPER_ADMIN / ADMIN / MANAGER
export async function DELETE(request: NextRequest) {
  try {
    // auth check
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '\u672a\u767b\u5f55' }, { status: 401 })
    }
    const userRole = session.user?.role
    const canManageStore =
      userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'MANAGER'
    if (!canManageStore) {
      return NextResponse.json({ error: '\u6ca1\u6709\u6743\u9650' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return badRequest('\u7f3a\u5c11\u5e97\u94fa id')
    }
    await prisma.store.delete({ where: { id } })
    await clearCacheByPrefix(CACHE_KEY_PREFIX)
    return NextResponse.json({ success: true })
  } catch {
    return serverError('Failed to delete store')
  }
}
