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

// GET - 获取订单追踪（支持 poId 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const poId = searchParams.get('poId');

    const where = poId ? { poId } : {};

    const list = await prisma.orderTracking.findMany({
      where,
      orderBy: { statusDate: 'desc' }
    });

    return NextResponse.json(list.map(toTracking));
  } catch (error: any) {
    console.error('Error fetching order tracking:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order tracking', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建订单追踪
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { poId, status, statusDate, notes } = body;

    if (!poId || !status) {
      return NextResponse.json(
        { error: 'poId, status 不能为空' },
        { status: 400 }
      );
    }

    const prismaStatus = statusFromFront[status] ?? (status as any);
    const date = statusDate ? new Date(statusDate) : new Date();

    const row = await prisma.orderTracking.create({
      data: {
        poId: String(poId),
        status: prismaStatus,
        statusDate: date,
        notes: notes ? String(notes) : null
      }
    });

    return NextResponse.json(toTracking(row), { status: 201 });
  } catch (error: any) {
    console.error('Error creating order tracking:', error);
    return NextResponse.json(
      { error: 'Failed to create order tracking', details: error.message },
      { status: 500 }
    );
  }
}
