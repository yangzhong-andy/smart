import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

// GET - 单条库存流水
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.stockLog.findUnique({
      where: { id },
      include: {
        variant: { include: { product: true } },
        warehouse: true,
      },
    });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      ...toStockLog(row),
      variant: row.variant,
      warehouse: row.warehouse,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch stock log', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除库存流水（谨慎使用，一般流水不删）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.stockLog.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete stock log', details: error.message },
      { status: 500 }
    );
  }
}
