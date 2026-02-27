import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'payment-requests';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const storeId = searchParams.get("storeId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      status || 'all',
      storeId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !status && !storeId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (status) where.status = status;
    if (storeId) where.storeId = storeId;

    const [requests, total] = await prisma.$transaction([
      prisma.expenseRequest.findMany({
        where,
        select: {
          id: true, summary: true, category: true, amount: true,
          currency: true, storeId: true, storeName: true, country: true,
          voucher: true, status: true, createdBy: true, createdAt: true,
          submittedAt: true, approvedBy: true, approvedAt: true,
          rejectionReason: true, paidBy: true, paidAt: true,
          financeAccountId: true, financeAccountName: true,
          paymentFlowId: true, paymentVoucher: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.expenseRequest.count({ where }),
    ]);

    const response = {
      data: requests.map(r => ({
        id: r.id,
        expenseItem: r.summary,
        amount: Number(r.amount),
        currency: r.currency as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD",
        storeId: r.storeId || undefined,
        storeName: r.storeName || undefined,
        country: r.country || undefined,
        category: r.category,
        approvalDocument: r.voucher ? (r.voucher.startsWith('[') ? JSON.parse(r.voucher) : r.voucher) : undefined,
        status: r.status,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString(),
        approvedBy: r.approvedBy || undefined,
        approvedAt: r.approvedAt?.toISOString(),
        rejectionReason: r.rejectionReason || undefined,
        paidBy: r.paidBy || undefined,
        paidAt: r.paidAt?.toISOString(),
        paymentAccountId: r.financeAccountId || undefined,
        paymentAccountName: r.financeAccountName || undefined,
        paymentFlowId: r.paymentFlowId || undefined,
        paymentReceipt: r.paymentVoucher ? (r.paymentVoucher.startsWith('[') ? JSON.parse(r.paymentVoucher) : r.paymentVoucher) : undefined,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !status && !storeId) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}
