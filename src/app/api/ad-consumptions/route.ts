import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟（广告数据中等频率）
const CACHE_KEY_PREFIX = 'ad-consumptions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get("agencyId");
    const accountId = searchParams.get("accountId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      agencyId || 'all',
      accountId || 'all',
      startDate || 'all',
      endDate || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !agencyId && !accountId && !startDate && !endDate) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Ad consumptions cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (accountId) where.adAccountId = accountId;
    if (startDate || endDate) {
      where.consumptionDate = {};
      if (startDate) where.consumptionDate.gte = new Date(startDate);
      if (endDate) where.consumptionDate.lte = new Date(endDate);
    }

    const [consumptions, total] = await prisma.$transaction([
      prisma.adConsumption.findMany({
        where,
        select: {
          id: true, agencyId: true, agencyName: true, adAccountId: true, accountName: true,
          consumptionDate: true, amount: true, currency: true, status: true,
          notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { consumptionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adConsumption.count({ where }),
    ]);

    const response = {
      data: consumptions.map(c => ({
        id: c.id,
        agencyId: c.agencyId,
        agencyName: c.agencyName,
        accountId: c.adAccountId,
        accountName: c.accountName,
        consumptionDate: c.consumptionDate.toISOString().split('T')[0],
        amount: Number(c.amount),
        currency: c.currency,
        status: c.status,
        notes: c.notes || undefined,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !agencyId && !accountId && !startDate && !endDate) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET ad-consumptions error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const consumption = await prisma.adConsumption.create({
      data: {
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        adAccountId: body.accountId,
        accountName: body.accountName,
        consumptionDate: new Date(body.consumptionDate),
        amount: body.amount,
        currency: body.currency || "USD",
        status: body.status || "PENDING",
        notes: body.notes,
      },
    });

    // 清除广告消费缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: consumption.id,
      agencyName: consumption.agencyName,
      amount: Number(consumption.amount),
      createdAt: consumption.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST ad-consumptions error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
