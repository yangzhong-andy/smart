import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'ad-recharges';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get("agencyId");
    const accountId = searchParams.get("accountId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      agencyId || 'all',
      accountId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !agencyId && !accountId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Ad recharges cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (accountId) where.adAccountId = accountId;

    const [recharges, total] = await prisma.$transaction([
      prisma.adRecharge.findMany({
        where,
        select: {
          id: true, agencyId: true, agencyName: true, adAccountId: true, accountName: true,
          date: true, amount: true, currency: true, paymentStatus: true,
          notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adRecharge.count({ where }),
    ]);

    const response = {
      data: recharges.map(r => ({
        id: r.id,
        agencyId: r.agencyId,
        agencyName: r.agencyName,
        accountId: r.adAccountId,
        accountName: r.accountName,
        date: r.date.toISOString().split('T')[0],
        amount: Number(r.amount),
        currency: r.currency,
        status: r.paymentStatus,
        notes: r.notes || undefined,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !agencyId && !accountId) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET ad-recharges error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const recharge = await prisma.adRecharge.create({
      data: {
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        adAccountId: body.accountId,
        accountName: body.accountName,
        date: new Date(body.date),
        month: body.month || new Date(body.date).toISOString().slice(0, 7),
        account: { connect: { id: body.accountId } },
        amount: body.amount,
        currency: body.currency || "USD",
        paymentStatus: body.paymentStatus || "Pending",
        notes: body.notes,
      },
    });

    // 清除广告充值缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: recharge.id,
      agencyName: recharge.agencyName,
      amount: Number(recharge.amount),
      createdAt: recharge.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST ad-recharges error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
