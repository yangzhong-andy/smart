import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'income-requests';

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
      prisma.incomeRequest.findMany({
        where,
        select: {
          id: true, uid: true, date: true, summary: true, category: true,
          amount: true, currency: true, storeId: true, storeName: true,
          remark: true, voucher: true, status: true, createdBy: true,
          createdAt: true, submittedAt: true, approvedBy: true, approvedAt: true,
          rejectionReason: true, financeAccountId: true, financeAccountName: true,
          receivedBy: true, receivedAt: true, paymentFlowId: true, paymentVoucher: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.incomeRequest.count({ where }),
    ]);

    const response = {
      data: requests.map(r => ({
        id: r.id,
        uid: r.uid || undefined,
        date: r.date.toISOString().split('T')[0],
        summary: r.summary,
        category: r.category,
        amount: Number(r.amount),
        currency: r.currency,
        storeId: r.storeId || undefined,
        storeName: r.storeName || undefined,
        remark: r.remark || undefined,
        voucher: r.voucher ? (r.voucher.startsWith('[') ? JSON.parse(r.voucher) : r.voucher) : undefined,
        status: r.status,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString(),
        approvedBy: r.approvedBy || undefined,
        approvedAt: r.approvedAt?.toISOString(),
        rejectionReason: r.rejectionReason || undefined,
        financeAccountId: r.financeAccountId || undefined,
        financeAccountName: r.financeAccountName || undefined,
        receivedBy: r.receivedBy || undefined,
        receivedAt: r.receivedAt?.toISOString(),
        paymentFlowId: r.paymentFlowId || undefined,
        paymentVoucher: r.paymentVoucher ? (r.paymentVoucher.startsWith('[') ? JSON.parse(r.paymentVoucher) : r.paymentVoucher) : undefined,
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

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const incomeRequest = await prisma.incomeRequest.create({
      data: {
        uid: body.uid || null,
        date: new Date(body.date),
        summary: body.summary,
        category: body.category,
        amount: body.amount,
        currency: body.currency || 'CNY',
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        remark: body.remark || null,
        voucher: body.voucher ? (Array.isArray(body.voucher) ? JSON.stringify(body.voucher) : body.voucher) : null,
        status: body.status || 'Pending_Approval',
        createdBy: body.createdBy || '系统',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
      },
    });

    // 清除收入申请缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: incomeRequest.id,
      summary: incomeRequest.summary,
      amount: Number(incomeRequest.amount),
      createdAt: incomeRequest.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
