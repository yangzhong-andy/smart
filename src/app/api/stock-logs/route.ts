import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function toStockLog(row: any) {
  return {
    id: row.id,
    variantId: row.variantId,
    warehouseId: row.warehouseId,
    reason: row.reason,
    movementType: row.movementType,
    qty: row.qty,
    qtyBefore: row.qtyBefore,
    qtyAfter: row.qtyAfter,
    unitCost: row.unitCost != null ? Number(row.unitCost) : undefined,
    totalCost: row.totalCost != null ? Number(row.totalCost) : undefined,
    currency: row.currency ?? undefined,
    operator: row.operator ?? undefined,
    operationDate: row.operationDate.toISOString().split('T')[0],
    relatedOrderId: row.relatedOrderId ?? undefined,
    relatedOrderType: row.relatedOrderType ?? undefined,
    relatedOrderNumber: row.relatedOrderNumber ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

// GET - 获取库存流水（支持 variantId、warehouseId、reason、operationDate 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const variantId = searchParams.get('variantId');
    const warehouseId = searchParams.get('warehouseId');
    const reason = searchParams.get('reason');
    const operationDateFrom = searchParams.get('operationDateFrom');
    const operationDateTo = searchParams.get('operationDateTo');

    const where: Record<string, unknown> = {};
    if (variantId) where.variantId = variantId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (reason) where.reason = reason;
    if (operationDateFrom || operationDateTo) {
      where.operationDate = {};
      if (operationDateFrom) (where.operationDate as Record<string, Date>).gte = new Date(operationDateFrom);
      if (operationDateTo) (where.operationDate as Record<string, Date>).lte = new Date(operationDateTo);
    }

    const list = await prisma.stockLog.findMany({
      where,
      include: {
        variant: { include: { product: true } },
        warehouse: true,
      },
      orderBy: { operationDate: 'desc' },
    });

    const transformed = list.map((row) => ({
      ...toStockLog(row),
      variant: row.variant,
      warehouse: row.warehouse,
    }));

    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Error fetching stock logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock logs', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建库存流水
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      variantId,
      warehouseId,
      reason,
      movementType,
      qty,
      qtyBefore,
      qtyAfter,
      unitCost,
      totalCost,
      currency,
      operator,
      operationDate,
      relatedOrderId,
      relatedOrderType,
      relatedOrderNumber,
      notes,
    } = body;

    if (!variantId || !warehouseId || !reason || !movementType || qty == null || qtyBefore == null || qtyAfter == null || !operationDate) {
      return NextResponse.json(
        { error: 'variantId, warehouseId, reason, movementType, qty, qtyBefore, qtyAfter, operationDate 不能为空' },
        { status: 400 }
      );
    }

    const row = await prisma.stockLog.create({
      data: {
        variantId: String(variantId),
        warehouseId: String(warehouseId),
        reason: reason as any,
        movementType: movementType as any,
        qty: Number(qty),
        qtyBefore: Number(qtyBefore),
        qtyAfter: Number(qtyAfter),
        unitCost: unitCost != null ? Number(unitCost) : null,
        totalCost: totalCost != null ? Number(totalCost) : null,
        currency: currency ?? null,
        operator: operator ? String(operator) : null,
        operationDate: new Date(operationDate),
        relatedOrderId: relatedOrderId ?? null,
        relatedOrderType: relatedOrderType ?? null,
        relatedOrderNumber: relatedOrderNumber ?? null,
        notes: notes ? String(notes) : null,
      },
      include: {
        variant: { include: { product: true } },
        warehouse: true,
      },
    });

    return NextResponse.json(
      { ...toStockLog(row), variant: row.variant, warehouse: row.warehouse },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating stock log:', error);
    return NextResponse.json(
      { error: 'Failed to create stock log', details: error.message },
      { status: 500 }
    );
  }
}
