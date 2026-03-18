import { NextRequest, NextResponse } from 'next/server';
import { executeDeliveryOrderInbound } from '@/lib/inbound-delivery-order';
import { clearCacheByPrefix } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * POST 拿货单入库
 * Body: { warehouseId: string, itemQtys?: Record<string, number>, receivedQty?: number }
 * - itemQtys: 多SKU时每个SKU的实收数量，key是item id，value是数量
 * - receivedQty: 单SKU时的实收数量（兼容旧版本）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deliveryOrderId } = await params;
  try {
    const body = await request.json();
    const warehouseId = body.warehouseId as string | undefined;
    const itemQtys = body.itemQtys as Record<string, number> | undefined;
    const receivedQty = body.receivedQty != null ? Number(body.receivedQty) : undefined;

    if (!warehouseId) {
      return NextResponse.json(
        { error: '请提供有效的 warehouseId' },
        { status: 400 }
      );
    }

    // 校验：需要提供 itemQtys（多SKU）或 receivedQty（单SKU）之一
    const hasItemQtys = itemQtys && Object.keys(itemQtys).length > 0;
    const hasReceivedQty = receivedQty != null && receivedQty >= 0;

    if (!hasItemQtys && !hasReceivedQty) {
      return NextResponse.json(
        { error: '请提供实收数量（多SKU用 itemQtys，单SKU用 receivedQty）' },
        { status: 400 }
      );
    }

    // 优先使用 itemQtys（多SKU模式），否则使用 receivedQty（单SKU兼容模式）
    const result = await executeDeliveryOrderInbound(deliveryOrderId, warehouseId, hasItemQtys ? itemQtys : receivedQty!);

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
