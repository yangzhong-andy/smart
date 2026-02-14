import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'supplier-payments';

function toPayment(row: any) {
  return {
    id: row.id,
    billId: row.billId,
    supplierProfileId: row.supplierProfileId,
    supplierName: row.supplierName,
    amount: Number(row.amount),
    currency: row.currency,
    paymentDate: row.paymentDate.toISOString().split('T')[0],
    paymentAccountId: row.paymentAccountId,
    paymentAccountName: row.paymentAccountName,
    paymentMethod: row.paymentMethod,
    paymentFlowId: row.paymentFlowId,
    paymentVoucher: row.paymentVoucher ?? undefined,
    paidBy: row.paidBy,
    paidAt: row.paidAt.toISOString(),
    notes: row.notes ?? undefined
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const billId = searchParams.get("billId");
    const supplierProfileId = searchParams.get("supplierProfileId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      billId || 'all',
      supplierProfileId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !billId && !supplierProfileId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Supplier payments cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (billId) where.billId = billId;
    if (supplierProfileId) where.supplierProfileId = supplierProfileId;

    const [list, total] = await prisma.$transaction([
      prisma.supplierPayment.findMany({
        where,
        select: {
          id: true, billId: true, supplierProfileId: true, supplierName: true,
          amount: true, currency: true, paymentDate: true,
          paymentAccountId: true, paymentAccountName: true,
          paymentMethod: true, paymentFlowId: true, paymentVoucher: true,
          paidBy: true, paidAt: true, notes: true,
        },
        orderBy: { paidAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplierPayment.count({ where }),
    ]);

    const response = {
      data: list.map(toPayment),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !billId && !supplierProfileId) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET supplier-payments error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { billId, supplierProfileId, supplierName, amount, currency, paymentDate, paymentAccountId, paymentAccountName, paymentMethod, paymentFlowId, paymentVoucher, paidBy, paidAt, notes } = body;

    if (!billId || !supplierProfileId || !supplierName || amount == null || !currency || !paymentDate || !paymentAccountId || !paymentAccountName || !paymentMethod || !paymentFlowId || !paidBy || !paidAt) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const payment = await prisma.supplierPayment.create({
      data: {
        billId,
        supplierProfileId,
        supplierName,
        amount,
        currency,
        paymentDate: new Date(paymentDate),
        paymentAccountId,
        paymentAccountName,
        paymentMethod,
        paymentFlowId,
        paymentVoucher: paymentVoucher || null,
        paidBy,
        paidAt: new Date(paidAt),
        notes: notes || null,
      },
    });

    // 清除供应商付款缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json(toPayment(payment));
  } catch (error: any) {
    console.error("POST supplier-payments error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
