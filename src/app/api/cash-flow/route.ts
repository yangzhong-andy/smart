import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CashFlowType } from "@prisma/client";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

const TYPE_MAP: Record<string, CashFlowType> = {
  income: CashFlowType.INCOME,
  INCOME: CashFlowType.INCOME,
  expense: CashFlowType.EXPENSE,
  EXPENSE: CashFlowType.EXPENSE,
  transfer: CashFlowType.TRANSFER,
  TRANSFER: CashFlowType.TRANSFER,
};

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

    // 尝试从缓存获取（仅第一页且非大分页，避免缓存超大 payload 导致超时）
    if (!noCache && page === 1 && pageSize <= 500 && !accountId && !type && !startDate && !endDate) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (accountId) where.accountId = accountId;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    // 默认仅在小分页时返回凭证字段，避免缓存体积过大；
    // 但当显式传入 noCache=true（例如流水明细使用 SWR 全量拉取并不走 Redis 缓存）时，
    // 仍然返回付款凭证/转账凭证，保证前端能展示图片。
    const includeVoucher = pageSize <= 100 || noCache;
    const [flows, total] = await prisma.$transaction([
      prisma.cashFlow.findMany({
        where,
        select: {
          id: true, uid: true, accountId: true, accountName: true, type: true, date: true,
          amount: true, currency: true, relatedId: true, businessNumber: true,
          summary: true, category: true, remark: true, status: true,
          isReversal: true, reversedById: true,
          ...(includeVoucher ? { voucher: true, paymentVoucher: true, transferVoucher: true } : {}),
          createdAt: true, updatedAt: true,
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cashFlow.count({ where }),
    ]);

    const response = {
      data: flows.map((f: any) => ({
        id: f.id,
        uid: f.uid || undefined,
        accountId: f.accountId,
        accountName: f.accountName,
        type: f.type,
        date: f.date.toISOString().split('T')[0],
        amount: Number(f.amount),
        currency: f.currency,
        relatedOrderId: f.relatedId || undefined,
        businessNumber: f.businessNumber || undefined,
        description: f.summary,
        category: f.category,
        flowStatus: f.status,
        notes: f.remark || undefined,
        isReversal: f.isReversal,
        reversedById: f.reversedById || undefined,
        ...(includeVoucher ? {
          voucher: f.voucher || undefined,
          paymentVoucher: f.paymentVoucher || undefined,
          transferVoucher: f.transferVoucher || undefined,
        } : {}),
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页、非大分页且无筛选时，避免缓存过大）
    if (!noCache && page === 1 && pageSize <= 500 && !accountId && !type && !startDate && !endDate) {
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
    const rawType = String(body.type ?? "").trim();
    const type = TYPE_MAP[rawType];
    if (!type) {
      return NextResponse.json(
        { error: "无效的 type，应为 income / expense / transfer（或 INCOME / EXPENSE / TRANSFER）" },
        { status: 400 }
      );
    }
    const rawDate = body.date;
    const flowDate = (rawDate != null && String(rawDate).trim() !== "")
      ? new Date(rawDate)
      : new Date();
    if (Number.isNaN(flowDate.getTime())) {
      return NextResponse.json(
        { error: "无效的 date，请传 ISO 日期字符串或有效日期" },
        { status: 400 }
      );
    }
    const toVoucherStr = (v: unknown): string | null => {
      if (v == null || v === "") return null;
      if (Array.isArray(v)) return v.length ? JSON.stringify(v) : null;
      if (typeof v === "string") return v.trim() || null;
      return null;
    };
    const paymentVoucherVal = body.paymentVoucher !== undefined ? toVoucherStr(body.paymentVoucher) : null;
    const transferVoucherVal = body.transferVoucher !== undefined ? toVoucherStr(body.transferVoucher) : null;
    const voucherVal = body.voucher !== undefined ? toVoucherStr(body.voucher) : (paymentVoucherVal ?? transferVoucherVal ?? null);
    const flow = await prisma.cashFlow.create({
      data: {
        uid: body.uid || null,
        accountId: body.accountId,
        accountName: body.accountName ?? "",
        type,
        date: flowDate,
        summary: body.description ?? body.summary ?? "",
        category: body.category ?? "",
        amount: body.amount,
        currency: body.currency || "CNY",
        remark: body.notes ?? body.remark ?? "",
        relatedId: body.relatedOrderId ?? body.relatedId ?? null,
        businessNumber: body.businessNumber ?? null,
        voucher: voucherVal,
        paymentVoucher: paymentVoucherVal,
        transferVoucher: transferVoucherVal,
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
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
