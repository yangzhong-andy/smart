import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 180; // 3分钟
const CACHE_KEY_PREFIX = 'expense-requests';

const nonEmpty = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
};

const replacePayeeLine = (remark: string, label: string, value?: string) => {
  if (!value) return remark;
  const line = `${label}：${value}`;
  const pattern = new RegExp(`^${label}：.*$`, "m");
  return pattern.test(remark) ? remark.replace(pattern, line) : `${remark}\n${line}`;
};

async function resolvePurchasePayee(body: any) {
  const category = String(body.category || "");
  const summary = String(body.summary || "");
  const isPurchase = category.startsWith("采购") || summary.startsWith("采购");
  if (!isPurchase) {
    return {
      payeeName: nonEmpty(body.payeeName),
      payeeAccount: nonEmpty(body.payeeAccount),
      remark: nonEmpty(body.remark),
    };
  }

  type PayeeContract = {
    supplierName: string;
    supplier: { name: string; bankAccount: string | null; bankName: string | null } | null;
  };
  let contract: PayeeContract | null = null;
  const relatedId = nonEmpty(body.relatedId);
  if (relatedId) {
    const deliveryOrder = await prisma.deliveryOrder.findUnique({
      where: { id: relatedId },
      select: {
        contract: {
          select: {
            supplierName: true,
            supplier: { select: { name: true, bankAccount: true, bankName: true } },
          },
        },
      },
    });
    contract = deliveryOrder?.contract || null;
  }

  const businessNumber = nonEmpty(body.businessNumber);
  if (!contract && businessNumber) {
    contract = await prisma.purchaseContract.findUnique({
      where: { contractNumber: businessNumber },
      select: {
        supplierName: true,
        supplier: { select: { name: true, bankAccount: true, bankName: true } },
      },
    });
  }

  const supplier = contract?.supplier;
  const payeeName =
    nonEmpty(supplier?.name) || nonEmpty(body.payeeName) || nonEmpty(contract?.supplierName);
  const payeeAccount = nonEmpty(supplier?.bankAccount) || nonEmpty(body.payeeAccount);
  const payeeBank = nonEmpty(supplier?.bankName);
  let remark = nonEmpty(body.remark) || "";
  remark = replacePayeeLine(remark, "收款人", payeeName);
  remark = replacePayeeLine(remark, "开户行", payeeBank);
  remark = replacePayeeLine(remark, "收款账号", payeeAccount);

  return { payeeName, payeeAccount, remark: remark || undefined };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const storeId = searchParams.get("storeId");
    const departmentId = searchParams.get("departmentId");
    const compact = searchParams.get("compact");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const noCache = searchParams.get("noCache") === "true";

    // Procurement pages only need to know whether a delivery order already
    // has an active tail-payment request. Keep this response deliberately
    // small: do not load vouchers, remarks, payee details, or amounts.
    if (compact === "tail-status") {
      const activeStatuses = ["Pending_Approval", "Approved", "Paid"];
      const rows = await prisma.expenseRequest.findMany({
        where: {
          relatedId: { not: null },
          status: { in: activeStatuses },
          OR: [
            { category: "采购/采购尾款" },
            { summary: { contains: "采购尾款" } },
          ],
        },
        select: { id: true, relatedId: true, status: true, summary: true },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(pageSize, 1), 1000),
      });
      return NextResponse.json({
        data: rows,
        pagination: { page: 1, pageSize: rows.length, total: rows.length, totalPages: 1 },
      });
    }

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      status || 'all',
      storeId || 'all',
      departmentId || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !status && !storeId && !departmentId) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {};
    if (status) where.status = status;
    if (storeId) where.storeId = storeId;
    if (departmentId) where.departmentId = departmentId;

    const [requests, total] = await prisma.$transaction([
      prisma.expenseRequest.findMany({
        where,
        select: {
          id: true, uid: true, summary: true, category: true, amount: true,
          currency: true, storeId: true, storeName: true, country: true,
          payeeName: true,
          payeeAccount: true,
          businessNumber: true,
          relatedId: true,
          remark: true,
          departmentId: true,
          departmentName: true,
          status: true, createdBy: true, createdAt: true, submittedAt: true,
          date: true,
          approvedBy: true, approvedAt: true, rejectionReason: true,
          paidBy: true, paidAt: true, financeAccountId: true, financeAccountName: true,
          voucher: true, paymentVoucher: true, warehouseId: true,
          containerId: true, containerNo: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.expenseRequest.count({ where }),
    ]);

    // 如果 containerNo 为空但有 containerId，批量查询 Container 表补充柜号
    const containerIds = requests
      .filter(r => !!r.containerId && !r.containerNo)
      .map(r => r.containerId!);
    const uniqueContainerIds = [...new Set(containerIds)];

    let containerNoMap: Record<string, string> = {};
    if (uniqueContainerIds.length > 0) {
      const containers = await prisma.container.findMany({
        where: { id: { in: uniqueContainerIds } },
        select: { id: true, containerNo: true },
      });
      containerNoMap = Object.fromEntries(containers.map(c => [c.id, c.containerNo]));
    }

    const response = {
      data: requests.map(r => ({
        id: r.id,
        date: r.date ? r.date.toISOString().slice(0, 10) : undefined,
        uid: r.uid || undefined,
        summary: r.summary,
        category: r.category,
        amount: Number(r.amount),
        currency: r.currency,
        storeId: r.storeId || undefined,
        storeName: r.storeName || undefined,
        country: r.country || undefined,
        businessNumber: r.businessNumber || undefined,
        relatedId: r.relatedId || undefined,
        remark: r.remark || undefined,
        departmentId: r.departmentId || undefined,
        departmentName: r.departmentName || undefined,
        status: r.status,
        voucher: r.voucher || undefined,
        paymentVoucher: r.paymentVoucher || undefined,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        submittedAt: r.submittedAt?.toISOString(),
        approvedBy: r.approvedBy || undefined,
        approvedAt: r.approvedAt?.toISOString(),
        rejectionReason: r.rejectionReason || undefined,
        paidBy: r.paidBy || undefined,
        paidAt: r.paidAt?.toISOString(),
        financeAccountId: r.financeAccountId || undefined,
        financeAccountName: r.financeAccountName || undefined,
        payeeName: r.payeeName || undefined,
        payeeAccount: r.payeeAccount || undefined,
        containerId: r.containerId || undefined,
        containerNo: r.containerNo || (r.containerId ? containerNoMap[r.containerId] : undefined) || undefined,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !status && !storeId && !departmentId) {
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
    const payee = await resolvePurchasePayee(body);
    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        uid: body.uid || null,
        date: body.date ? new Date(body.date) : new Date(),
        summary: body.summary,
        category: body.category,
        amount: body.amount,
        currency: body.currency || "CNY",
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        country: body.country || null,
        businessNumber: body.businessNumber || null,
        relatedId: body.relatedId || null,
        remark: payee.remark
          ? (Array.isArray(body.containerIds) && body.containerIds.length > 0
            ? `${payee.remark} [关联柜子: ${body.containerIds.join(",")}]`
            : payee.remark)
          : (Array.isArray(body.containerIds) && body.containerIds.length > 0
            ? `[关联柜子: ${body.containerIds.join(",")}]`
            : null),
        payeeName: payee.payeeName ?? null,
        payeeAccount: payee.payeeAccount ?? null,
        voucher: body.voucher ? (typeof body.voucher === "string" ? body.voucher : JSON.stringify(body.voucher)) : null,
        status: body.status || "Pending_Approval",
        createdBy: body.createdBy || '系统',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
        departmentId: body.departmentId || null,
        departmentName: body.departmentName || null,
        warehouseId: body.warehouseId || null,
      },
    });

    // 清除支出申请缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);
    if (
      expenseRequest.relatedId &&
      (expenseRequest.category === "采购/采购尾款" || expenseRequest.summary.includes("采购尾款"))
    ) {
      await clearCacheByPrefix("monthly-bills");
    }

    return NextResponse.json({
      id: expenseRequest.id,
      summary: expenseRequest.summary,
      amount: Number(expenseRequest.amount),
      createdAt: expenseRequest.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
