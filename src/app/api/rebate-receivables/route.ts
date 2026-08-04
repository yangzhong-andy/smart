import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'rebate-receivables';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get("agencyId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      agencyId || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !agencyId && !status) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (status) where.status = status;

    const [receivables, total] = await prisma.$transaction([
      prisma.rebateReceivable.findMany({
        where,
        select: {
          id: true, agencyId: true, agencyName: true, adAccountId: true, accountName: true,
          rechargeDate: true, rebateAmount: true, currency: true, status: true,
          notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.rebateReceivable.count({ where }),
    ]);

    const response = {
      data: receivables.map(r => ({
        id: r.id,
        agencyId: r.agencyId,
        agencyName: r.agencyName,
        accountId: r.adAccountId,
        accountName: r.accountName ?? undefined,
        month: r.rechargeDate.toISOString().slice(0, 7),
        rebateAmount: Number(r.rebateAmount),
        currency: r.currency,
        status: r.status,
        notes: r.notes ?? undefined,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !agencyId && !status) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rechargeDate = body.month
      ? new Date(body.month + "-01")
      : body.rechargeDate
        ? new Date(body.rechargeDate)
        : new Date();
    const receivable = await prisma.rebateReceivable.create({
      data: {
        rechargeId: body.rechargeId ?? `manual-${Date.now()}`,
        rechargeDate,
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        adAccountId: body.accountId ?? "",
        accountName: body.accountName ?? "",
        platform: body.platform ?? "manual",
        rebateAmount: body.rebateAmount,
        currency: body.currency || "USD",
        currentBalance: body.currentBalance ?? body.rebateAmount,
        status: body.status || "待核销",
        notes: body.notes ?? null,
      },
    });

    // 清除返点应收缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: receivable.id,
      agencyName: receivable.agencyName,
      rebateAmount: Number(receivable.rebateAmount),
      createdAt: receivable.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
