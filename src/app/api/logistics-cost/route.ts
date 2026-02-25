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
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20") || 20, 100);

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
      costType: c.costType,
      amount: c.amount.toString(),
      currency: c.currency,
      paymentType: c.paymentType,
      creditDays: c.creditDays ?? undefined,
      dueDate: c.dueDate?.toISOString() ?? undefined,
      paymentStatus: c.paymentStatus,
      paidDate: c.paidDate?.toISOString() ?? undefined,
      invoiceNumber: c.invoiceNumber ?? undefined,
      invoiceStatus: c.invoiceStatus ?? undefined,
      notes: c.notes ?? undefined,
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
    console.error("GET logistics-cost error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/logistics-cost - 创建物流费用
 * Body: outboundBatchId?, logisticsChannelId?, costType, amount, currency,
 *       paymentType, creditDays?, dueDate?, paymentStatus, paidDate?,
 *       invoiceNumber?, invoiceStatus?, notes?
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

    const cost = await prisma.logisticsCost.create({
      data: {
        outboundBatchId: body.outboundBatchId ?? null,
        logisticsChannelId: body.logisticsChannelId ?? null,
        costType,
        amount,
        currency,
        paymentType,
        creditDays: body.creditDays ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        paymentStatus,
        paidDate: body.paidDate ? new Date(body.paidDate) : null,
        invoiceNumber: body.invoiceNumber ?? null,
        invoiceStatus: body.invoiceStatus ?? null,
        notes: body.notes ?? null,
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
      createdAt: cost.createdAt.toISOString(),
      outboundBatchId: cost.outboundBatchId ?? undefined,
      logisticsChannelId: cost.logisticsChannelId ?? undefined,
    });
  } catch (error: unknown) {
    console.error("POST logistics-cost error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    );
  }
}

