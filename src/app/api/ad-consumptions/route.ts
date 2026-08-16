import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";
import { syncAdvertisingMonthlyBills } from "@/lib/auto-generate-bills";

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
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (agencyId) where.agencyId = agencyId;
    if (accountId) where.adAccountId = accountId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [consumptions, total] = await prisma.$transaction([
      prisma.adConsumption.findMany({
        where,
        select: {
          id: true, agencyId: true, agencyName: true, adAccountId: true, accountName: true,
          storeId: true, storeName: true, month: true, date: true, amount: true, currency: true,
          campaignName: true, campaignId: true, cashConsumption: true, creditConsumption: true, giftConsumption: true, consumptionType: true,
          estimatedRebate: true, rebateRate: true, dueDate: true, rebateDueDate: true, isSettled: true,
          voucher: true, notes: true, createdAt: true, updatedAt: true,
        },
        orderBy: { date: 'desc' },
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
        adAccountId: c.adAccountId,
        accountName: c.accountName,
        storeId: c.storeId || undefined,
        storeName: c.storeName || undefined,
        month: c.month || undefined,
        date: c.date.toISOString().split('T')[0],
        amount: Number(c.amount),
        currency: c.currency,
        campaignName: c.campaignName || undefined,
        campaignId: c.campaignId || undefined,
        cashConsumption: c.cashConsumption != null ? Number(c.cashConsumption) : undefined,
        creditConsumption: c.creditConsumption != null ? Number(c.creditConsumption) : undefined,
        giftConsumption: c.giftConsumption != null ? Number(c.giftConsumption) : undefined,
        consumptionType: c.consumptionType || undefined,
        estimatedRebate: c.estimatedRebate != null ? Number(c.estimatedRebate) : undefined,
        dueDate: c.dueDate?.toISOString?.()?.split('T')[0] || undefined,
        status: c.isSettled ? "SETTLED" : "PENDING",
        voucher: c.voucher || undefined,
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
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ error: "广告消耗日期无效" }, { status: 400 });
    }
    const consumption = await prisma.adConsumption.create({
      data: {
        id: randomUUID(),
        updatedAt: new Date(),
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        adAccountId: body.accountId,
        accountName: body.accountName,
        date,
        month: body.month || date.toISOString().slice(0, 7),
        amount: body.amount,
        currency: body.currency || "USD",
        isSettled: body.isSettled || false,
        estimatedRebate: body.estimatedRebate ?? null,
        rebateRate: body.rebateRate ?? null,
        cashConsumption: body.cashConsumption ?? null,
        creditConsumption: body.creditConsumption ?? null,
        giftConsumption: body.giftConsumption ?? null,
        campaignName: body.campaignName ?? null,
        campaignId: body.campaignId ?? null,
        consumptionType: body.consumptionType ?? null,
        storeId: body.storeId ?? null,
        storeName: body.storeName ?? null,
        notes: body.notes,
      },
    });

    // 清除广告消费缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    const billSync = await syncAdvertisingMonthlyBills([consumption.month]);

    return NextResponse.json({
      id: consumption.id,
      agencyName: consumption.agencyName,
      amount: Number(consumption.amount),
      billSync,
      createdAt: consumption.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
