import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const statusFromFront: Record<string, 'PURCHASING' | 'PRODUCING' | 'SHIPPED' | 'PARTIAL_ARRIVAL' | 'ARRIVED' | 'COMPLETED'> = {
  采购中: 'PURCHASING',
  生产中: 'PRODUCING',
  已发货: 'SHIPPED',
  部分到货: 'PARTIAL_ARRIVAL',
  已到货: 'ARRIVED',
  已完成: 'COMPLETED'
};
const statusToFront: Record<string, string> = {
  PURCHASING: '采购中',
  PRODUCING: '生产中',
  SHIPPED: '已发货',
  PARTIAL_ARRIVAL: '部分到货',
  ARRIVED: '已到货',
  COMPLETED: '已完成'
};

function toTracking(row: any) {
  return {
    id: row.id,
    poId: row.poId,
    status: statusToFront[row.status] ?? row.status,
    statusDate: row.statusDate.toISOString().split('T')[0],
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

// GET - 单条
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.orderTracking.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toTracking(row));
  } catch (error: any) {
    console.error('Error fetching order tracking:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order tracking', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { poId, status, statusDate, notes } = body;

    const updateData: Record<string, any> = {};
    if (poId != null) updateData.poId = String(poId);
    if (status != null) updateData.status = statusFromFront[status] ?? status;
    if (statusDate != null) updateData.statusDate = new Date(statusDate);
    if (notes !== undefined) updateData.notes = notes ? String(notes) : null;

    const row = await prisma.orderTracking.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(toTracking(row));
  } catch (error: any) {
    console.error('Error updating order tracking:', error);
    return NextResponse.json(
      { error: 'Failed to update order tracking', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.orderTracking.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting order tracking:', error);
    return NextResponse.json(
      { error: 'Failed to delete order tracking', details: error.message },
      { status: 500 }
    );
  }
}
