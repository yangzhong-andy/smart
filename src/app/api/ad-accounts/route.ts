import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'ad-accounts';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get("agencyId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      agencyId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Ad-accounts cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where = agencyId ? { agencyId } : {};

    const [list, total] = await prisma.$transaction([
      prisma.adAccount.findMany({
        where,
        select: {
          id: true, agencyId: true, agencyName: true, accountName: true,
          currentBalance: true, rebateReceivable: true, creditLimit: true,
          currency: true, country: true, notes: true,
          createdAt: true, updatedAt: true,
          agency: { select: { id: true, name: true, platform: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.adAccount.count({ where }),
    ]);

    const serialized = list.map((a) => ({
      ...a,
      currentBalance: Number(a.currentBalance),
      rebateReceivable: Number(a.rebateReceivable),
      creditLimit: Number(a.creditLimit),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    const response = {
      data: serialized,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET ad-accounts error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = await prisma.adAccount.create({
      data: {
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        accountName: body.accountName,
        currentBalance: body.currentBalance ?? 0,
        rebateReceivable: body.rebateReceivable ?? 0,
        creditLimit: body.creditLimit ?? 0,
        currency: body.currency ?? "USD",
        country: body.country,
        notes: body.notes,
      },
    });

    // 清除广告账户相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      ...account,
      currentBalance: Number(account.currentBalance),
      rebateReceivable: Number(account.rebateReceivable),
      creditLimit: Number(account.creditLimit),
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST ad-accounts error:", error);
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
