import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'commission-records';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      employeeId || 'all',
      month || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !employeeId && !month) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Commission records cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (employeeId) where.employeeId = employeeId;
    if (month) where.month = month;

    const [records, total] = await prisma.$transaction([
      prisma.commissionRecord.findMany({
        where,
        select: {
          id: true, employeeId: true, employeeName: true, ruleId: true, ruleName: true,
          month: true, commissionType: true, amount: true, currency: true,
          status: true, notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.commissionRecord.count({ where }),
    ]);

    const response = {
      data: records.map(r => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        ruleId: r.ruleId || undefined,
        ruleName: r.ruleName || undefined,
        month: r.month,
        commissionType: r.commissionType,
        amount: Number(r.amount),
        currency: r.currency,
        status: r.status,
        notes: r.notes || undefined,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !employeeId && !month) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET commission-records error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const record = await prisma.commissionRecord.create({
      data: {
        employeeId: body.employeeId,
        employeeName: body.employeeName,
        ruleId: body.ruleId || null,
        ruleName: body.ruleName || null,
        month: body.month,
        commissionType: body.commissionType,
        amount: body.amount,
        currency: body.currency || "CNY",
        status: body.status || "PENDING",
        notes: body.notes || null,
      },
    });

    // 清除佣金记录缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: record.id,
      employeeName: record.employeeName,
      amount: Number(record.amount),
      createdAt: record.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST commission-records error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
