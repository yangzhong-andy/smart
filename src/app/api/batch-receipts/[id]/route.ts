import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function toReceipt(row: any) {
  return {
    id: row.id,
    poId: row.poId,
    receiptId: row.receiptId,
    qty: row.qty,
    receivedQty: row.receivedQty,
    ownership: (row.ownership as Array<{ storeId: string; storeName: string; percentage: number }>) ?? [],
    receivedDate: row.receivedDate.toISOString().split('T')[0],
    createdAt: row.createdAt.toISOString()
  };
}

// GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.batchReceipt.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toReceipt(row));
  } catch (error: any) {
    console.error('Error fetching batch receipt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch receipt', details: error.message },
      { status: 500 }
    );
  }
}

// PUT
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { poId, receiptId, qty, receivedQty, ownership, receivedDate } = body;

    const updateData: Record<string, any> = {};
    if (poId != null) updateData.poId = String(poId);
    if (receiptId != null) updateData.receiptId = String(receiptId);
    if (qty != null) updateData.qty = Number(qty);
    if (receivedQty != null) updateData.receivedQty = Number(receivedQty);
    if (ownership !== undefined) updateData.ownership = Array.isArray(ownership) ? ownership : [];
    if (receivedDate != null) updateData.receivedDate = new Date(receivedDate);

    const row = await prisma.batchReceipt.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(toReceipt(row));
  } catch (error: any) {
    console.error('Error updating batch receipt:', error);
    return NextResponse.json(
      { error: 'Failed to update batch receipt', details: error.message },
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
    await prisma.batchReceipt.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting batch receipt:', error);
    return NextResponse.json(
      { error: 'Failed to delete batch receipt', details: error.message },
      { status: 500 }
    );
  }
}
