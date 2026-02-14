import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'monthly-bills';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const billCategory = searchParams.get("billCategory");
    const month = searchParams.get("month");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      status || 'all',
      billCategory || 'all',
      month || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !status && !billCategory && !month) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Monthly bills cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (status) where.status = status;
    if (billCategory) where.billCategory = billCategory;
    if (month) where.month = month;

    const [bills, total] = await prisma.$transaction([
      prisma.monthlyBill.findMany({
        where,
        select: {
          id: true, uid: true, month: true, billCategory: true, billType: true,
          agencyId: true, agencyName: true, adAccountId: true, accountName: true,
          supplierId: true, supplierName: true, factoryId: true, factoryName: true,
          totalAmount: true, currency: true, rebateAmount: true, netAmount: true,
          status: true, createdBy: true, createdAt: true, submittedAt: true,
          approvedAt: true, rejectionReason: true, paidBy: true, paidAt: true,
          paymentMethod: true, paymentAccountId: true, paymentAccountName: true,
          paymentFlowId: true, paymentVoucherNumber: true, paymentRemarks: true, notes: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.monthlyBill.count({ where }),
    ]);

    const response = {
      data: bills.map(b => ({
        id: b.id,
        uid: b.uid || undefined,
        month: b.month,
        billCategory: b.billCategory,
        billType: b.billType,
        agencyId: b.agencyId || undefined,
        agencyName: b.agencyName,
        adAccountId: b.adAccountId || undefined,
        accountName: b.accountName,
        supplierId: b.supplierId || undefined,
        supplierName: b.supplierName,
        factoryId: b.factoryId || undefined,
        factoryName: b.factoryName,
        totalAmount: Number(b.totalAmount),
        currency: b.currency,
        rebateAmount: Number(b.rebateAmount),
        netAmount: Number(b.netAmount),
        status: b.status,
        createdBy: b.createdBy,
        createdAt: b.createdAt.toISOString(),
        submittedAt: b.submittedAt?.toISOString(),
        approvedAt: b.approvedAt?.toISOString(),
        rejectionReason: b.rejectionReason || undefined,
        paidBy: b.paidBy || undefined,
        paidAt: b.paidAt?.toISOString(),
        paymentMethod: b.paymentMethod || undefined,
        paymentAccountId: b.paymentAccountId || undefined,
        paymentAccountName: b.paymentAccountName || undefined,
        paymentFlowId: b.paymentFlowId || undefined,
        paymentVoucherNumber: b.paymentVoucherNumber || undefined,
        paymentRemarks: b.paymentRemarks || undefined,
        notes: b.notes || undefined,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !status && !billCategory && !month) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("GET monthly-bills error:", error);
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const bill = await prisma.monthlyBill.create({
      data: {
        uid: body.uid || null,
        month: body.month,
        billCategory: body.billCategory,
        billType: body.billType,
        agencyId: body.agencyId || null,
        agencyName: body.agencyName,
        adAccountId: body.adAccountId || null,
        accountName: body.accountName || null,
        supplierId: body.supplierId || null,
        supplierName: body.supplierName || null,
        factoryId: body.factoryId || null,
        factoryName: body.factoryName || null,
        totalAmount: body.totalAmount,
        currency: body.currency || "CNY",
        rebateAmount: body.rebateAmount ?? 0,
        netAmount: body.netAmount ?? body.totalAmount,
        status: body.status || "Draft",
        createdBy: body.createdBy || '系统',
        notes: body.notes || null,
      },
    });

    // 清除月度账单缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: bill.id,
      month: bill.month,
      totalAmount: Number(bill.totalAmount),
      createdAt: bill.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error("POST monthly-bills error:", error);
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
