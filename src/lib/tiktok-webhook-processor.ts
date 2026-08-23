import { prisma } from "@/lib/prisma";
import { getOrderDetail } from "@/lib/tiktok-shop-api";
import { deductStockForOrder, restoreStockForCancelledOrder } from "@/lib/tiktok-stock-deduct";
import { decryptTikTokSecret } from "@/lib/tiktok-secrets";
import { totalOrderQuantity } from "@/lib/tiktok-order-quantity";

/** Process one persisted TikTok webhook event. Errors are propagated so the
 * webhook log remains retryable instead of being marked as successful. */
export async function processTikTokWebhookEvent(
  typeNum: number,
  shopId: string | null,
  orderId: string | null,
  orderData: any,
) {
  if (!shopId || !orderId || ![1, 2, 3].includes(typeNum)) return;

  try {
    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      throw new Error(`店铺 ${shopId} 未找到或未授权`);
    }

    const appConfig = shop.appKey
      ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } })
      : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = decryptTikTokSecret(appConfig?.appSecret) || process.env.TIKTOK_APP_SECRET || "";
    const accessToken = decryptTikTokSecret(shop.accessToken);
    if (!accessToken) throw new Error(`店铺 ${shopId} 的 TikTok access token 为空`);

    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
      // The basic status is still retained, but the event remains retryable so
      // a later token refresh can fetch the complete order detail.
      await updateOrderBasic(orderId, orderData);
      throw new Error("TikTok access token 即将过期，已记录基础状态，等待刷新后重试");
    }

    const detailData = await getOrderDetail(accessToken, shop.shopCipher, appKey, appSecret, [orderId]);
    const orders = detailData?.orders || [];
    if (orders.length === 0) {
      await updateOrderBasic(orderId, orderData);
      throw new Error("TikTok 暂未返回订单详情，等待下次重试");
    }

    const order = orders[0];
    await prisma.tikTokOrder.upsert({
      where: { orderId: order.id },
      create: {
        shopId,
        orderId: order.id,
        status: order.status,
        orderStatus: order.status,
        totalAmount: order.payment?.total_amount || order.total_amount || null,
        currency: order.payment?.currency || order.currency || null,
        itemCount: totalOrderQuantity(order.line_items),
        createTime: order.create_time ? new Date(order.create_time * 1000) : null,
        updateTime: order.update_time ? new Date(order.update_time * 1000) : null,
        rawData: order,
      },
      update: {
        status: order.status,
        orderStatus: order.status,
        totalAmount: order.payment?.total_amount || order.total_amount || null,
        currency: order.payment?.currency || order.currency || null,
        itemCount: totalOrderQuantity(order.line_items),
        updateTime: order.update_time ? new Date(order.update_time * 1000) : null,
        rawData: order,
      },
    });

    if (order.status === "CANCELLED") {
      await restoreStockForCancelledOrder(orderId);
      return;
    }

    // A stock mapping problem should not make the order webhook look failed:
    // the order itself has already been persisted and the stock retry path is
    // idempotent on the next order sync.
    await deductStockForOrder(orderId, shopId, order);
  } catch (error: any) {
    console.error(`[TikTok Webhook] 处理订单 ${orderId} 失败:`, error?.message || error);
    throw error;
  }
}

async function updateOrderBasic(orderId: string, orderData: any) {
  const existing = await prisma.tikTokOrder.findUnique({ where: { orderId } });
  if (!existing) return;
  const nextStatus = orderData?.order_status || existing.status;
  await prisma.tikTokOrder.update({
    where: { orderId },
    data: {
      status: nextStatus,
      orderStatus: nextStatus,
      updateTime: orderData?.update_time ? new Date(orderData.update_time * 1000) : new Date(),
    },
  });
  if (nextStatus === "CANCELLED") await restoreStockForCancelledOrder(orderId);
}
