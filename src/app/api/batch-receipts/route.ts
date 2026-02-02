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

// GET - 获取分批拿货（支持 poId 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const poId = searchParams.get('poId');

    const where = poId ? { poId } : {};

    const list = await prisma.batchReceipt.findMany({
      where,
      orderBy: { receivedDate: 'desc' }
    });

    return NextResponse.json(list.map(toReceipt));
  } catch (error: any) {
    console.error('Error fetching batch receipts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch receipts', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { poId, receiptId, qty, receivedQty, ownership, receivedDate } = body;

    if (!poId || !receiptId || qty == null || receivedQty == null || !Array.isArray(ownership) || !receivedDate) {
      return NextResponse.json(
        { error: 'poId, receiptId, qty, receivedQty, ownership, receivedDate 不能为空' },
        { status: 400 }
      );
    }

    const row = await prisma.batchReceipt.create({
      data: {
        poId: String(poId),
        receiptId: String(receiptId),
        qty: Number(qty),
        receivedQty: Number(receivedQty),
        ownership: ownership,
        receivedDate: new Date(receivedDate)
      }
    });

    return NextResponse.json(toReceipt(row), { status: 201 });
  } catch (error: any) {
    console.error('Error creating batch receipt:', error);
    return NextResponse.json(
      { error: 'Failed to create batch receipt', details: error.message },
      { status: 500 }
    );
  }
}
