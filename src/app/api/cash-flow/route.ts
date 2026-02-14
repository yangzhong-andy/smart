import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 120; // 2分钟（资金流高频）
const CACHE_KEY_PREFIX = 'cash-flow';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      accountId || 'all',
      type || 'all',
      startDate || 'all',
      endDate || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !accountId && !type && !startDate && !endDate) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Cash flow cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.flowDate = {};
      if (startDate) where.flowDate.gte = new Date(startDate);
      if (endDate) where.flowDate.lte = new Date(endDate);
    }

    const [flows, total] = await prisma.$transaction([
      prisma.cashFlow.findMany({
        where,
        select: {
          id: true, uid: true, accountId: true, type: true, flowDate: true,
          amount: true, currency: true, balance: true, relatedOrderId: true,
          relatedOrderType: true, description: true, notes: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { flowDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cashFlow.count({ where }),
    ]);

    const response = {
      data: flows.map(f => ({
        id: f.id,
        uid: f.uid || undefined,
        accountId: f.accountId,
        type: f.type,
        flowDate: f.flowDate.toISOString().split('T')[0],
        amount: Number(f.amount),
        currency: f.currency,
        balance: Number(f.balance),
        relatedOrderId: f.relatedOrderId || undefined,
        relatedOrderType: f.relatedOrderType || undefined,
        description: f.description || undefined,
        notes: f.notes || undefined,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !accountId && !type && !startDate && !endDate) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET cash-flow error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const flow = await prisma.cashFlow.create({
      data: {
        uid: body.uid || null,
        accountId: body.accountId,
        type: body.type,
        flowDate: new Date(body.flowDate),
        amount: body.amount,
        currency: body.currency || "CNY",
        balance: body.balance ?? 0,
        relatedOrderId: body.relatedOrderId || null,
        relatedOrderType: body.relatedOrderType || null,
        description: body.description || null,
        notes: body.notes || null,
      },
    });

    // 清除资金流缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: flow.id,
      uid: flow.uid,
      type: flow.type,
      amount: Number(flow.amount),
      createdAt: flow.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST cash-flow error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
