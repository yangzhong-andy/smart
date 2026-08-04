import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function toVelocity(row: any) {
  return {
    id: row.id,
    storeId: row.storeId,
    storeName: row.storeName,
    sku: row.sku,
    dailySales: Number(row.dailySales),
    currentStock: row.currentStock,
    inTransitQty: row.inTransitQty,
    daysUntilStockout: row.daysUntilStockout,
    recommendedRestock: row.recommendedRestock,
    lastUpdated: row.lastUpdated.toISOString()
  };
}

// GET - 获取销售速度列表（支持 storeId 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    const where = storeId ? { storeId } : {};

    const list = await prisma.salesVelocity.findMany({
      where,
      orderBy: { lastUpdated: 'desc' }
    });

    return NextResponse.json(list.map(toVelocity));
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch sales velocity', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建或按 storeId+sku 更新
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, storeName, sku, dailySales, currentStock, inTransitQty, daysUntilStockout, recommendedRestock } = body;

    if (!storeId || !storeName || !sku || dailySales == null || currentStock == null || daysUntilStockout == null || recommendedRestock == null) {
      return NextResponse.json(
        { error: 'storeId, storeName, sku, dailySales, currentStock, daysUntilStockout, recommendedRestock 不能为空' },
        { status: 400 }
      );
    }

    const row = await prisma.salesVelocity.upsert({
      where: {
        storeId_sku: { storeId: String(storeId), sku: String(sku) }
      },
      create: {
        storeId: String(storeId),
        storeName: String(storeName).trim(),
        sku: String(sku),
        dailySales: Number(dailySales),
        currentStock: Number(currentStock),
        inTransitQty: Number(inTransitQty ?? 0),
        daysUntilStockout: Number(daysUntilStockout),
        recommendedRestock: Number(recommendedRestock)
      },
      update: {
        storeName: String(storeName).trim(),
        dailySales: Number(dailySales),
        currentStock: Number(currentStock),
        inTransitQty: Number(inTransitQty ?? 0),
        daysUntilStockout: Number(daysUntilStockout),
        recommendedRestock: Number(recommendedRestock)
      }
    });

    return NextResponse.json(toVelocity(row), { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to upsert sales velocity', details: error.message },
      { status: 500 }
    );
  }
}
