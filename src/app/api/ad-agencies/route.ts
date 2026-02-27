import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

const PLATFORM_MAP: Record<string, "FB" | "Google" | "TikTok" | "OTHER"> = {
  FB: "FB", Google: "Google", TikTok: "TikTok", "其他": "OTHER", OTHER: "OTHER",
};

// 缓存配置
const CACHE_TTL = 600; // 10分钟（代理商数据变动少）
const CACHE_KEY_PREFIX = 'ad-agencies';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(CACHE_KEY_PREFIX, 'list');

    // 尝试从缓存获取
    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const list = await prisma.adAgency.findMany({
      select: {
        id: true, name: true, platform: true, rebateRate: true,
        rebateConfig: true, settlementCurrency: true, creditTerm: true,
        contact: true, phone: true, notes: true,
        createdAt: true, updatedAt: true,
        _count: { select: { accounts: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    
    const serialized = list.map((a) => ({
      ...a,
      platform: a.platform === "OTHER" ? "其他" : a.platform,
      rebateRate: Number(a.rebateRate),
      rebateConfig: a.rebateConfig as object | null,
      accountCount: a._count.accounts,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    // 设置缓存
    if (!noCache) {
      await setCache(cacheKey, serialized, CACHE_TTL);
    }
    
    return NextResponse.json(serialized);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const platform = PLATFORM_MAP[body.platform] ?? "OTHER";
    const agency = await prisma.adAgency.create({
      data: {
        name: body.name,
        platform,
        rebateRate: body.rebateRate ?? 0,
        rebateConfig: body.rebateConfig ?? undefined,
        settlementCurrency: body.settlementCurrency,
        creditTerm: body.creditTerm,
        contact: body.contact,
        phone: body.phone,
        notes: body.notes,
      },
    });

    // 清除广告代理商缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      ...agency,
      platform: agency.platform === "OTHER" ? "其他" : agency.platform,
      rebateRate: Number(agency.rebateRate),
      createdAt: agency.createdAt.toISOString(),
      updatedAt: agency.updatedAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
