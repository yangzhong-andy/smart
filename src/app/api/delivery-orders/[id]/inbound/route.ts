import { NextRequest, NextResponse } from 'next/server';
import { executeDeliveryOrderInbound } from '@/lib/inbound-delivery-order';
import { clearCacheByPrefix } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * POST 拿货单入库
 * Body: { warehouseId: string, receivedQty: number }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deliveryOrderId } = await params;
  try {
    const body = await request.json();
    const warehouseId = body.warehouseId as string | undefined;
    const receivedQty = body.receivedQty != null ? Number(body.receivedQty) : undefined;

    if (!warehouseId || receivedQty == null || receivedQty < 0) {
      return NextResponse.json(
        { error: '请提供有效的 warehouseId 和实收数量（receivedQty ≥ 0）' },
        { status: 400 }
      );
    }

    const result = await executeDeliveryOrderInbound(deliveryOrderId, warehouseId, receivedQty);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // 入库成功：清除相关缓存，保证列表页拿到最新数据
    await clearCacheByPrefix('inbound-batches');
    await clearCacheByPrefix('pending-inbound');
    await clearCacheByPrefix('delivery-orders');

    return NextResponse.json({
      success: true,
      message: '入库成功，库存已增加，拿货单状态已更新为已入库'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '入库失败' },
      { status: 500 }
    );
  }
}
