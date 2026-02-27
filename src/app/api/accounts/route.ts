import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AccountType } from '@prisma/client'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'
import { serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟
const CACHE_KEY_PREFIX = 'accounts';

// GET - 获取所有账户
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const accountType = searchParams.get('type')
    const storeId = searchParams.get('storeId')
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      accountType || 'all',
      storeId || 'all',
      String(page),
      String(pageSize)
    )

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey)
      if (cached) {
        return NextResponse.json(cached)
      }
    }

    const where: any = {}
    if (accountType) where.accountType = accountType as AccountType
    if (storeId) where.storeId = storeId

    const [accounts, total] = await prisma.$transaction([
      prisma.bankAccount.findMany({
        where,
        select: {
          id: true, name: true, accountNumber: true, accountType: true,
          accountCategory: true, accountPurpose: true, currency: true, country: true,
          originalBalance: true, initialCapital: true, exchangeRate: true, rmbBalance: true,
          parentId: true, storeId: true, companyEntity: true, owner: true,
          notes: true, platformAccount: true, platformPassword: true, platformUrl: true,
          createdAt: true, updatedAt: true,
          _count: { select: { children: true, cashFlows: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.bankAccount.count({ where }),
    ])
    
    const response = {
      data: accounts.map(acc => ({
        id: acc.id,
        name: acc.name,
        accountNumber: acc.accountNumber,
        accountType: acc.accountType === 'CORPORATE' ? '对公' as const : acc.accountType === 'PERSONAL' ? '对私' as const : '平台' as const,
        accountCategory: acc.accountCategory === 'PRIMARY' ? 'PRIMARY' as const : 'VIRTUAL' as const,
        accountPurpose: acc.accountPurpose,
        currency: (acc.currency === 'RMB' ? 'CNY' : acc.currency) as 'CNY' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'HKD' | 'SGD' | 'AUD',
        country: acc.country,
        originalBalance: Number(acc.originalBalance),
        initialCapital: acc.initialCapital ? Number(acc.initialCapital) : undefined,
        exchangeRate: Number(acc.exchangeRate),
        rmbBalance: Number(acc.rmbBalance),
        parentId: acc.parentId || undefined,
        storeId: acc.storeId || undefined,
        companyEntity: acc.companyEntity || undefined,
        owner: acc.owner || undefined,
        notes: acc.notes,
        platformAccount: acc.platformAccount || undefined,
        platformPassword: acc.platformPassword || undefined,
        platformUrl: acc.platformUrl || undefined,
        createdAt: acc.createdAt.toISOString(),
        updatedAt: acc.updatedAt.toISOString(),
        childCount: acc._count.children,
        cashFlowCount: acc._count.cashFlows,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    }

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL)
    }

    return NextResponse.json(response)
  } catch (error: any) {
    if (error?.message?.includes('TLS connection') || error?.message?.includes('connection') || error?.message?.includes('ECONNREFUSED') || error?.code === 'P1001' || !process.env.DATABASE_URL) {
      return NextResponse.json({ error: '数据库连接失败，请检查网络或数据库状态', code: 'DATABASE_CONNECTION_ERROR' }, { status: 503 })
    }
    return serverError(error?.message || '获取账户列表失败')
  }
}

// POST - 创建账户（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const account = await prisma.bankAccount.create({
      data: {
        name: body.name,
        accountNumber: body.accountNumber,
        accountType: body.accountType as AccountType,
        accountCategory: body.accountCategory || 'PRIMARY',
        accountPurpose: body.accountPurpose || null,
        currency: body.currency || 'CNY',
        country: body.country,
        originalBalance: body.originalBalance ?? 0,
        initialCapital: body.initialCapital ?? null,
        exchangeRate: body.exchangeRate ?? 1,
        rmbBalance: body.rmbBalance ?? 0,
        parentId: body.parentId ?? null,
        storeId: body.storeId ?? null,
        companyEntity: body.companyEntity ?? null,
        owner: body.owner ?? null,
        notes: body.notes ?? null,
        platformAccount: body.platformAccount ?? null,
        platformPassword: body.platformPassword ?? null,
        platformUrl: body.platformUrl ?? null,
      }
    })

    // 清除账户相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({
      id: account.id,
      name: account.name,
      accountType: account.accountType,
      createdAt: account.createdAt.toISOString()
    })
  } catch (error: any) {
    return serverError(error?.message || '创建账户失败')
  }
}
