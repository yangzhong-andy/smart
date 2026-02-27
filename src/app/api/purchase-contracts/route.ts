import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 300; // 5分钟
const CACHE_KEY_PREFIX = 'purchase-contracts';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const supplierId = searchParams.get("supplierId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      status || 'all',
      supplierId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !status && !supplierId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const [contracts, total] = await prisma.$transaction([
      prisma.purchaseContract.findMany({
        where,
        select: {
          id: true, contractNumber: true, supplierId: true, supplierName: true,
          sku: true, skuId: true, unitPrice: true, totalQty: true,
          pickedQty: true, finishedQty: true, totalAmount: true,
          depositRate: true, depositAmount: true, depositPaid: true,
          tailPeriodDays: true, deliveryDate: true, status: true,
          totalPaid: true, totalOwed: true, approvedBy: true, approvedAt: true,
          createdAt: true, updatedAt: true,
          _count: { select: { items: true, deliveryOrders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.purchaseContract.count({ where }),
    ]);

    // 自动同步已支付的定金
    const paidDeposits = await prisma.expenseRequest.findMany({
      where: { status: 'Paid', summary: { contains: '采购合同定金' } }
    });
    const depositByContract: Record<string, number> = {};
    for (const req of paidDeposits) {
      const match = req.summary.match(/采购合同定金[：:\s]*([^\s]+)/);
      const cn = match?.[1];
      if (cn && Number.isFinite(Number(req.amount))) {
        depositByContract[cn] = (depositByContract[cn] || 0) + Number(req.amount);
      }
    }

    const response = {
      data: contracts.map(c => ({
        id: c.id,
        contractNumber: c.contractNumber,
        supplierId: c.supplierId || undefined,
        supplierName: c.supplierName,
        sku: c.sku,
        skuId: c.skuId || undefined,
        unitPrice: Number(c.unitPrice),
        totalQty: c.totalQty,
        pickedQty: c.pickedQty,
        finishedQty: c.finishedQty,
        totalAmount: Number(c.totalAmount),
        depositRate: Number(c.depositRate),
        depositAmount: Number(c.depositAmount),
        depositPaid: Number(c.depositPaid),
        tailPeriodDays: c.tailPeriodDays,
        deliveryDate: c.deliveryDate?.toISOString(),
        status: c.status,
        totalPaid: Number(c.totalPaid),
        totalOwed: Number(c.totalOwed),
        approvedBy: c.approvedBy || undefined,
        approvedAt: c.approvedAt?.toISOString(),
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        itemCount: c._count.items,
        deliveryOrderCount: c._count.deliveryOrders,
        syncedDeposit: depositByContract[c.contractNumber] || 0,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !status && !supplierId) {
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
    const contract = await prisma.purchaseContract.create({
      data: {
        contractNumber: body.contractNumber,
        supplierId: body.supplierId || null,
        supplierName: body.supplierName,
        sku: body.sku,
        skuId: body.skuId || null,
        unitPrice: body.unitPrice,
        totalQty: body.totalQty,
        totalAmount: body.totalAmount,
        depositRate: body.depositRate ?? 0,
        depositAmount: body.depositAmount ?? 0,
        depositPaid: body.depositPaid ?? 0,
        tailPeriodDays: body.tailPeriodDays ?? 0,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        status: body.status || 'PENDING_APPROVAL',
      },
    });

    // 清除采购合同缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: contract.id,
      contractNumber: contract.contractNumber,
      supplierName: contract.supplierName,
      createdAt: contract.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
