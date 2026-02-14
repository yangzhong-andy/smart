import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const TYPE_MAP_FRONT_TO_DB: Record<string, 'AD_AGENCY' | 'LOGISTICS' | 'VENDOR'> = {
  '广告代理商': 'AD_AGENCY',
  '物流商': 'LOGISTICS',
  '供货商': 'VENDOR'
};
const TYPE_MAP_DB_TO_FRONT: Record<string, string> = {
  'AD_AGENCY': '广告代理商',
  'LOGISTICS': '物流商',
  'VENDOR': '供货商'
};

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'supplier-monthly-bills';

function toBill(row: any) {
  return {
    id: row.id,
    uid: row.uid ?? undefined,
    supplierProfileId: row.supplierProfileId,
    supplierName: row.supplierName,
    supplierType: TYPE_MAP_DB_TO_FRONT[row.supplierType] ?? row.supplierType,
    month: row.month,
    billNumber: row.billNumber ?? undefined,
    billDate: row.billDate.toISOString().split('T')[0],
    supplierBillAmount: Number(row.supplierBillAmount),
    systemAmount: Number(row.systemAmount),
    difference: Number(row.difference),
    currency: row.currency,
    rebateAmount: Number(row.rebateAmount),
    rebateRate: row.rebateRate != null ? Number(row.rebateRate) : undefined,
    netAmount: Number(row.netAmount),
    relatedFlowIds: row.relatedFlowIds ?? [],
    uploadedBillFile: row.uploadedBillFile ?? undefined,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString(),
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    rejectionReason: row.rejectionReason ?? undefined,
    paidBy: row.paidBy ?? undefined,
    paidAt: row.paidAt?.toISOString(),
    paymentAccountId: row.paymentAccountId ?? undefined,
    paymentAccountName: row.paymentAccountName ?? undefined,
    paymentMethod: row.paymentMethod ?? undefined,
    paymentFlowId: row.paymentFlowId ?? undefined,
    paymentVoucher: row.paymentVoucher ?? undefined,
    notes: row.notes ?? undefined
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierProfileId = searchParams.get('supplierProfileId');
    const month = searchParams.get('month');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      supplierProfileId || 'all',
      month || 'all',
      status || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        console.log(`✅ Supplier monthly bills cache HIT: ${cacheKey}`);
        return NextResponse.json(cached);
      }
    }

    const validStatuses = ['Draft', 'Pending_Approval', 'Approved', 'Paid', 'Rejected'] as const;
    const where: any = {};
    if (supplierProfileId) where.supplierProfileId = supplierProfileId;
    if (month) where.month = month;
    if (status && validStatuses.includes(status as typeof validStatuses[number])) where.status = status;

    const [list, total] = await prisma.$transaction([
      prisma.supplierMonthlyBill.findMany({
        where,
        select: {
          id: true, uid: true, supplierProfileId: true, supplierName: true,
          supplierType: true, month: true, billNumber: true, billDate: true,
          supplierBillAmount: true, systemAmount: true, difference: true,
          currency: true, rebateAmount: true, rebateRate: true, netAmount: true,
          relatedFlowIds: true, uploadedBillFile: true, status: true,
          createdBy: true, createdAt: true, submittedAt: true,
          approvedBy: true, approvedAt: true, rejectionReason: true,
          paidBy: true, paidAt: true, paymentAccountId: true,
          paymentAccountName: true, paymentMethod: true, paymentFlowId: true,
          paymentVoucher: true, notes: true,
        },
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplierMonthlyBill.count({ where }),
    ]);

    const response = {
      data: list.map(toBill),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching supplier monthly bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier monthly bills', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建账单（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { supplierProfileId, supplierName, supplierType, month, billDate, supplierBillAmount, systemAmount, currency, rebateAmount, rebateRate, netAmount, notes } = body;

    if (!supplierProfileId || !supplierName || !supplierType || !month || billDate == null || supplierBillAmount == null || systemAmount == null || currency == null) {
      return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
    }

    const bill = await prisma.supplierMonthlyBill.create({
      data: {
        supplierProfileId,
        supplierName,
        supplierType: TYPE_MAP_FRONT_TO_DB[supplierType] ?? supplierType,
        month,
        billDate: new Date(billDate),
        supplierBillAmount,
        systemAmount,
        currency,
        rebateAmount: rebateAmount ?? 0,
        rebateRate: rebateRate ?? null,
        netAmount: netAmount ?? (supplierBillAmount - (rebateAmount ?? 0)),
        notes: notes ?? null,
        status: 'Draft',
        createdBy: body.createdBy || '系统',
        relatedFlowIds: [],
      }
    });

    // 清除供应商月度账单缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json(toBill(bill));
  } catch (error: any) {
    console.error('Error creating supplier monthly bill:', error);
    return NextResponse.json(
      { error: 'Failed to create supplier monthly bill', details: error.message },
      { status: 500 }
    );
  }
}
