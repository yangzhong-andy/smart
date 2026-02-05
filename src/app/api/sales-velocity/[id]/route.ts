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

// GET
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.salesVelocity.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toVelocity(row));
  } catch (error: any) {
    console.error('Error fetching sales velocity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sales velocity', details: error.message },
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
    const { storeId, storeName, sku, dailySales, currentStock, inTransitQty, daysUntilStockout, recommendedRestock } = body;

    const updateData: Record<string, any> = {};
    if (storeId != null) updateData.storeId = String(storeId);
    if (storeName != null) updateData.storeName = String(storeName).trim();
    if (sku != null) updateData.sku = String(sku);
    if (dailySales != null) updateData.dailySales = Number(dailySales);
    if (currentStock != null) updateData.currentStock = Number(currentStock);
    if (inTransitQty != null) updateData.inTransitQty = Number(inTransitQty);
    if (daysUntilStockout != null) updateData.daysUntilStockout = Number(daysUntilStockout);
    if (recommendedRestock != null) updateData.recommendedRestock = Number(recommendedRestock);

    const row = await prisma.salesVelocity.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(toVelocity(row));
  } catch (error: any) {
    console.error('Error updating sales velocity:', error);
    return NextResponse.json(
      { error: 'Failed to update sales velocity', details: error.message },
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
    await prisma.salesVelocity.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting sales velocity:', error);
    return NextResponse.json(
      { error: 'Failed to delete sales velocity', details: error.message },
      { status: 500 }
    );
  }
}
