import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CashFlowType, CashFlowStatus } from "@prisma/client";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";
import { requireApiUser } from "@/lib/api-auth";
import { summarizeCashFlows } from "@/lib/cash-flow-summary";
import type { Prisma } from "@prisma/client";

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

const STATUS_MAP: Record<string, CashFlowStatus> = {
  pending: CashFlowStatus.PENDING,
  PENDING: CashFlowStatus.PENDING,
  confirmed: CashFlowStatus.CONFIRMED,
  CONFIRMED: CashFlowStatus.CONFIRMED,
};

const INTERNAL_CATEGORIES = ["内部划拨", "换汇"];

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function buildWhere(searchParams: URLSearchParams): Prisma.CashFlowWhereInput {
  const accountId = searchParams.get("accountId");
  const type = searchParams.get("type");
  const status = searchParams.get("status");
  const currency = searchParams.get("currency");
  const category = searchParams.get("category");
  const subCategory = searchParams.get("subCategory");
  const businessNumber = searchParams.get("businessNumber");
  const keyword = String(searchParams.get("search") || "").trim();
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const and: Prisma.CashFlowWhereInput[] = [];

  if (searchParams.get("excludeInternal") === "true") {
    and.push({ category: { notIn: INTERNAL_CATEGORIES } });
  }
  if (accountId) and.push({ accountId });
  if (type && TYPE_MAP[type]) and.push({ type: TYPE_MAP[type] });
  if (status && STATUS_MAP[status]) and.push({ status: STATUS_MAP[status] });
  if (currency) and.push({ currency });
  if (businessNumber) and.push({ businessNumber });

  if (subCategory) {
    and.push({ category: subCategory });
  } else if (category) {
    and.push({
      OR: [
        { category },
        { category: { startsWith: `${category}/` } },
      ],
    });
  }

  if (validDate(startDate) || validDate(endDate)) {
    and.push({
      date: {
        ...(validDate(startDate) ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}),
        ...(validDate(endDate) ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
      },
    });
  }

  if (keyword) {
    const textSearch: Prisma.CashFlowWhereInput[] = [
      { summary: { contains: keyword, mode: "insensitive" } },
      { remark: { contains: keyword, mode: "insensitive" } },
      { accountName: { contains: keyword, mode: "insensitive" } },
      { businessNumber: { contains: keyword, mode: "insensitive" } },
      { category: { contains: keyword, mode: "insensitive" } },
    ];
    const numeric = Number(keyword.replace(/,/g, ""));
    if (Number.isFinite(numeric)) {
      textSearch.push({ amount: numeric }, { amount: -numeric });
    }
    and.push({ OR: textSearch });
  }

  return and.length ? { AND: and } : {};
}

function toSummaryRows(rows: Array<{
  type: CashFlowType;
  amount: unknown;
  currency: string;
  exchangeRate: unknown;
  account: { exchangeRate: unknown };
}>) {
  return rows.map((row) => ({
    type: row.type,
    amount: row.amount as any,
    currency: row.currency,
    exchangeRate: row.exchangeRate as any,
    accountExchangeRate: row.account.exchangeRate as any,
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(10000, Math.max(1, parseInt(searchParams.get("pageSize") || "20") || 20));
    const noCache = searchParams.get("noCache") === "true";
    const includeVouchers = searchParams.get("includeVouchers") !== "false";
    const includeSummary = searchParams.get("includeSummary") === "true";
    const includeBalances = searchParams.get("includeBalances") === "true";
    const where = buildWhere(searchParams);

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      searchParams.toString(),
    );

    // 尝试从缓存获取（仅第一页且非大分页，避免缓存超大 payload 导致超时）
    if (!noCache && page === 1 && pageSize <= 500) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const [flows, total] = await prisma.$transaction([
      prisma.cashFlow.findMany({
        where,
        select: {
          id: true, uid: true, accountId: true, accountName: true, type: true, date: true,
          amount: true, currency: true, relatedId: true, businessNumber: true,
          exchangeRate: true, platform: true, storeId: true, storeName: true,
          summary: true, category: true, remark: true, status: true,
          isReversal: true, reversedById: true,
          ...(includeVouchers ? { voucher: true, paymentVoucher: true, transferVoucher: true } : {}),
          createdAt: true, updatedAt: true,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.cashFlow.count({ where }),
    ]);

    const flowIds = flows.map((flow) => flow.id);
    const [paymentVoucherRows, transferVoucherRows] = !includeVouchers && flowIds.length
      ? await Promise.all([
          prisma.cashFlow.findMany({
            where: {
              id: { in: flowIds },
              OR: [{ paymentVoucher: { not: null } }, { voucher: { not: null } }],
            },
            select: { id: true },
          }),
          prisma.cashFlow.findMany({
            where: { id: { in: flowIds }, transferVoucher: { not: null } },
            select: { id: true },
          }),
        ])
      : [[], []];
    const paymentVoucherIds = new Set(paymentVoucherRows.map((flow) => flow.id));
    const transferVoucherIds = new Set(transferVoucherRows.map((flow) => flow.id));

    const response: Record<string, any> = {
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
        platform: f.platform || undefined,
        storeId: f.storeId || undefined,
        storeName: f.storeName || undefined,
        exchangeRate: f.exchangeRate != null ? Number(f.exchangeRate) : undefined,
        summary: f.summary || undefined,
        description: f.summary,
        category: f.category,
        flowStatus: f.status,
        remark: f.remark || undefined,
        notes: f.remark || undefined,
        isReversal: f.isReversal,
        reversedById: f.reversedById || undefined,
        ...(includeVouchers ? {
          voucher: f.voucher || undefined,
          paymentVoucher: f.paymentVoucher || undefined,
          transferVoucher: f.transferVoucher || undefined,
        } : {
          hasPaymentVoucher: paymentVoucherIds.has(f.id),
          hasTransferVoucher: transferVoucherIds.has(f.id),
        }),
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    if (includeSummary || includeBalances) {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const summarySelect = {
        type: true,
        amount: true,
        currency: true,
        exchangeRate: true,
        account: { select: { exchangeRate: true } },
      } as const;

      const [summaryRows, monthRows, balanceRows] = await Promise.all([
        includeSummary ? prisma.cashFlow.findMany({ where, select: summarySelect }) : Promise.resolve([]),
        includeSummary ? prisma.cashFlow.findMany({
          where: {
            category: { notIn: INTERNAL_CATEGORIES },
            date: { gte: monthStart, lt: nextMonth },
          },
          select: summarySelect,
        }) : Promise.resolve([]),
        includeBalances ? prisma.cashFlow.groupBy({
          by: ["accountId"],
          where: { status: CashFlowStatus.CONFIRMED },
          _sum: { amount: true },
        }) : Promise.resolve([]),
      ]);

      if (includeSummary) {
        response.summary = summarizeCashFlows(toSummaryRows(summaryRows));
        response.monthSummary = summarizeCashFlows(toSummaryRows(monthRows));
      }
      if (includeBalances) {
        response.accountBalanceDeltas = Object.fromEntries(
          balanceRows.map((row) => [row.accountId, Number(row._sum.amount || 0)]),
        );
      }
    }

    // 设置缓存（仅第一页、非大分页且无筛选时，避免缓存过大）
    if (!noCache && page === 1 && pageSize <= 500) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

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
        status: CashFlowStatus.CONFIRMED,
        exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : 1,
        platform: body.platform || null,
        storeId: body.storeId || null,
        storeName: body.storeName || null,
      },
    });

    // 海外仓一件代发费：自动充值到仓库余额
    if (body.category === "物流/海外仓一件代发费" && body.warehouseId) {
      try {
        const warehouse = await prisma.warehouse.findUnique({ where: { id: body.warehouseId } });
        if (warehouse) {
          const chargeAmount = Math.abs(Number(body.amount));
          const oldBalance = Number(warehouse.balance || 0);
          await prisma.warehouse.update({
            where: { id: body.warehouseId },
            data: { balance: oldBalance + chargeAmount },
          });
          console.log(`[Warehouse Charge] ${warehouse.name} 充值 +${chargeAmount} (余额: ${oldBalance} → ${oldBalance + chargeAmount})`);
        }
      } catch (e: any) {
        console.error("[Warehouse Charge] 仓库充值失败:", e.message);
      }
    }

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

// PATCH - 快速更新单个字段（storeId/storeName/platform）
export async function PATCH(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const { id, storeId, storeName } = body;
    if (!id) return NextResponse.json({ error: '缺少id' }, { status: 400 });

    const updated = await prisma.cashFlow.update({
      where: { id },
      data: {
        ...(storeId !== undefined ? { storeId: storeId || null } : {}),
        ...(storeName !== undefined ? { storeName: storeName || null } : {}),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '更新失败' }, { status: 500 });
  }
}
