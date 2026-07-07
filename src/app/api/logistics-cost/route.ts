import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/logistics-cost - 获取物流费用列表（包含出库批次、物流渠道）
 * Query: page, pageSize, outboundBatchId, logisticsChannelId, costType, paymentStatus
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const outboundBatchId = searchParams.get("outboundBatchId");
    const logisticsChannelId = searchParams.get("logisticsChannelId");
    const costType = searchParams.get("costType");
    const paymentStatus = searchParams.get("paymentStatus");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20") || 20, 30);

    const where: any = {};
    if (outboundBatchId) where.outboundBatchId = outboundBatchId;
    if (logisticsChannelId) where.logisticsChannelId = logisticsChannelId;
    if (costType) where.costType = costType;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const [items, total] = await prisma.$transaction([
      prisma.logisticsCost.findMany({
        where,
        include: {
          outboundBatch: {
            include: {
              outboundOrder: true,
              warehouse: true,
              container: { select: { id: true, containerNo: true } },
            },
          },
          logisticsChannel: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.logisticsCost.count({ where }),
    ]);

    const data = items.map((c) => ({
      id: c.id,
      outboundBatchId: c.outboundBatchId ?? undefined,
      logisticsChannelId: c.logisticsChannelId ?? undefined,
      containerId: c.containerId ?? (c.outboundBatch?.container?.id ?? undefined),
      costType: c.costType,
      amount: c.amount.toString(),
      currency: c.currency,
      paymentType: c.paymentType,
      creditDays: c.creditDays ?? undefined,
      dueDate: c.dueDate?.toISOString() ?? undefined,
      paymentStatus: c.paymentStatus,
      expenseRequestId: c.expenseRequestId ?? undefined,
      paidDate: c.paidDate?.toISOString() ?? undefined,
      invoiceNumber: c.invoiceNumber ?? undefined,
      invoiceStatus: c.invoiceStatus ?? undefined,
      notes: c.notes ?? undefined,
      voucher: c.voucher ?? undefined,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      outboundBatch: c.outboundBatch
        ? {
            id: c.outboundBatch.id,
            batchNumber: c.outboundBatch.batchNumber,
            qty: c.outboundBatch.qty,
            shippedDate: c.outboundBatch.shippedDate.toISOString(),
            status: c.outboundBatch.status,
            outboundOrder: c.outboundBatch.outboundOrder
              ? {
                  id: c.outboundBatch.outboundOrder.id,
                  outboundNumber: c.outboundBatch.outboundOrder.outboundNumber,
                  sku: c.outboundBatch.outboundOrder.sku,
                }
              : undefined,
            warehouse: c.outboundBatch.warehouse
              ? {
                  id: c.outboundBatch.warehouse.id,
                  name: c.outboundBatch.warehouse.name,
                }
              : undefined,
            container: (c.outboundBatch as any)?.container
              ? {
                  id: (c.outboundBatch as any).container.id,
                  containerNo: (c.outboundBatch as any).container.containerNo,
                }
              : undefined,
          }
        : undefined,
      logisticsChannel: c.logisticsChannel
        ? {
            id: c.logisticsChannel.id,
            name: c.logisticsChannel.name,
            channelCode: c.logisticsChannel.channelCode,
          }
        : undefined,
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}

/** 将合计金额（元）按批次数拆成若干份，以「分」为整数避免浮点误差，余数摊到前几笔 */
function splitAmountAcrossBatches(totalYuan: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(totalYuan * 100);
  if (cents < 0) return [];
  const base = Math.floor(cents / count);
  const rem = cents % count;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = base + (i < rem ? 1 : 0);
    out.push(c / 100);
  }
  return out;
}

/**
 * POST /api/logistics-cost - 创建物流费用
 * Body: outboundBatchId? | outboundBatchIds?（多选，与 outboundBatchId 二选一优先数组）,
 *       logisticsChannelId?, costType, amount, currency,
 *       paymentType, creditDays?, dueDate?, paymentStatus, paidDate?,
 *       invoiceNumber?, invoiceStatus?, notes?
 * 多批次时：amount 为合计，按批次数平均分摊写入多条记录；备注自动追加分摊说明。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const costType = body.costType as string | undefined;
    const amountRaw = body.amount;
    const currency = body.currency as string | undefined;
    const paymentType = body.paymentType as string | undefined;
    const paymentStatus = body.paymentStatus as string | undefined;

    const amount = amountRaw != null ? Number(amountRaw) : NaN;

    if (!costType || !currency || !paymentType || !paymentStatus || !Number.isFinite(amount)) {
      return NextResponse.json(
        { error: "请提供有效的 costType、amount、currency、paymentType、paymentStatus" },
        { status: 400 }
      );
    }

    const rawIds: unknown[] = Array.isArray(body.outboundBatchIds)
      ? (body.outboundBatchIds as unknown[])
      : [];
    const fromArray = rawIds
      .filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());
    const seen = new Set<string>();
    const outboundBatchIds = fromArray.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    const single =
      typeof body.outboundBatchId === "string" && body.outboundBatchId.trim()
        ? body.outboundBatchId.trim()
        : null;
    const resolvedBatchIds = outboundBatchIds.length > 0 ? outboundBatchIds : single ? [single] : [];

    const logisticsChannelId =
      typeof body.logisticsChannelId === "string" && body.logisticsChannelId.trim()
        ? body.logisticsChannelId.trim()
        : null;
    const containerId =
      typeof body.containerId === "string" && body.containerId.trim()
        ? body.containerId.trim()
        : null;
    const baseNotes = typeof body.notes === "string" ? body.notes.trim() : "";
    const creditDays = body.creditDays != null && body.creditDays !== "" ? Number(body.creditDays) : null;
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    const paidDate = body.paidDate ? new Date(body.paidDate) : null;

    if (resolvedBatchIds.length <= 1) {
      const cost = await prisma.logisticsCost.create({
        data: {
          outboundBatchId: resolvedBatchIds[0] ?? null,
          logisticsChannelId,
          containerId,
          costType,
          amount,
          currency,
          paymentType,
          creditDays: Number.isFinite(creditDays as number) ? creditDays : null,
          dueDate,
          paymentStatus,
          paidDate,
          invoiceNumber: body.invoiceNumber ?? null,
          invoiceStatus: body.invoiceStatus ?? null,
          notes: baseNotes || null,
          voucher: typeof body.voucher === "string" && body.voucher ? body.voucher : null,
        },
        include: {
          outboundBatch: {
            include: {
              outboundOrder: true,
              warehouse: true,
            },
          },
          logisticsChannel: true,
        },
      });

      return NextResponse.json({
        id: cost.id,
        created: 1,
        ids: [cost.id],
        createdAt: cost.createdAt.toISOString(),
        outboundBatchId: cost.outboundBatchId ?? undefined,
        logisticsChannelId: cost.logisticsChannelId ?? undefined,
      });
    }

    const parts = splitAmountAcrossBatches(amount, resolvedBatchIds.length);
    const shareNote = `[多批次分摊 合计${amount}${currency} → ${resolvedBatchIds.length}笔]`;

    const rows = await prisma.$transaction(
      resolvedBatchIds.map((batchId, i) =>
        prisma.logisticsCost.create({
          data: {
            outboundBatchId: batchId,
            logisticsChannelId,
            containerId,
            costType,
            amount: parts[i]!,
            currency,
            paymentType,
            creditDays: Number.isFinite(creditDays as number) ? creditDays : null,
            dueDate,
            paymentStatus,
            paidDate,
            invoiceNumber: body.invoiceNumber ?? null,
            invoiceStatus: body.invoiceStatus ?? null,
            notes: [baseNotes, `${shareNote} 第${i + 1}/${resolvedBatchIds.length}笔`].filter(Boolean).join(" "),
            voucher: typeof body.voucher === "string" && body.voucher ? body.voucher : null,
          },
        })
      )
    );

    return NextResponse.json({
      id: rows[0]!.id,
      created: rows.length,
      ids: rows.map((r) => r.id),
      createdAt: rows[0]!.createdAt.toISOString(),
      outboundBatchId: rows[0]!.outboundBatchId ?? undefined,
      logisticsChannelId: rows[0]!.logisticsChannelId ?? undefined,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    );
  }
}

