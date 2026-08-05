import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getOrderDetail } from "@/lib/tiktok-shop-api";
import { deductStockForOrder } from "@/lib/tiktok-stock-deduct";
import { Buffer } from "buffer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function normalizeSignature(value: string): string {
  return value.trim()
    .replace(/^HMAC-SHA256\s+/i, "")
    .replace(/^sha256=/i, "")
    .trim()
    .toLowerCase();
}

function signaturesMatch(expected: string, received: string | null): boolean {
  if (!received) return false;
  const expectedBytes = Buffer.from(normalizeSignature(expected), "utf8");
  const receivedBytes = Buffer.from(normalizeSignature(received), "utf8");
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function buildSignatureCandidates(appSecret: string, rawBytes: Buffer): string[] {
  const bodyText = rawBytes.toString("utf-8");
  // TikTok's webhook signing scheme uses HMAC-SHA256 over the wrapped body.
  // Keep the raw-body form for compatibility with older webhook revisions.
  const messages = [
    rawBytes,
    Buffer.from(`${appSecret}${bodyText}${appSecret}`, "utf-8"),
  ];
  return messages.flatMap((message) => [
    createHmac("sha256", appSecret).update(message).digest("hex"),
    createHmac("sha256", appSecret).update(message).digest("base64"),
  ]);
}

async function getWebhookSecret(shopId: string | null): Promise<string> {
  try {
    const shop = shopId
      ? await prisma.tikTokShopSetting.findUnique({
          where: { shopId },
          select: { appKey: true },
        })
      : null;
    const appConfig = shop?.appKey
      ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } })
      : null;
    return appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";
  } catch (error) {
    console.error("[TikTok Webhook] failed to resolve app secret:", error);
    return "";
  }
}

/**
 * POST /api/tiktok/webhook
 * TikTok Shop Webhook 接收端点
 *
 * 收到订单状态变化推送后，自动拉取完整订单详情并存入数据库
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const rawBytes = await readStreamBytes(request.body);
    const rawBody = rawBytes.toString("utf-8");

    // 解析事件数据
    let eventData: any;
    try {
      eventData = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ code: 1, message: "invalid JSON" }, { status: 400 });
    }

    const typeNum = typeof eventData.type === "number" ? eventData.type : parseInt(eventData.type);
    const shopId = eventData.shop_id || null;
    const notificationId = eventData.tts_notification_id || null;
    const eventTimestamp = eventData.timestamp ? new Date(eventData.timestamp * 1000) : null;
    const orderData = eventData.data;
    const orderId = orderData?.order_id;

    const appSecret = await getWebhookSecret(shopId);
    const signatureHeaders: Array<[string, string | null]> = [
      // TikTok sends this header on the current webhook protocol.
      ["x-tt-signature", request.headers.get("x-tt-signature")],
      ["x-tts-signature", request.headers.get("x-tts-signature")],
      ["authorization", request.headers.get("authorization")],
    ];
    const signatureCandidates = buildSignatureCandidates(appSecret, rawBytes);
    const matchingHeader = signatureHeaders.find(([, value]) =>
      Boolean(value) && signatureCandidates.some((candidate) => signaturesMatch(candidate, value)),
    );
    if (!appSecret || !matchingHeader) {
      const providedHeader = signatureHeaders.find(([, value]) => Boolean(value));
      const signatureInfo = providedHeader
        ? `${providedHeader[0]} (length=${providedHeader[1]?.length ?? 0})`
        : "missing";
      console.warn(
        `[TikTok Webhook] invalid signature shop=${shopId || "unknown"} header=${signatureInfo} names=${Array.from(request.headers.keys()).join(",")}`,
      );
      return NextResponse.json({ code: 1, message: "invalid signature" }, { status: 401 });
    }

    console.log(`[TikTok Webhook] type=${typeNum} shop=${shopId} order=${orderId} signature=${matchingHeader[0]} took=${Date.now() - startTime}ms`);

    if (notificationId) {
      const duplicate = await prisma.tikTokWebhookLog.findFirst({
        where: { notificationId: String(notificationId) },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({ code: 0, message: "success" }, { status: 200 });
      }
    }

    // 先快速返回 200（TikTok 要求3秒内响应）
    // 实际处理放在后面异步执行

    // 存储到日志
    let webhookLogId: string | null = null;
    try {
      const webhookLog = await prisma.tikTokWebhookLog.create({
        data: {
          shopId, eventType: String(eventData.type ?? "UNKNOWN"),
          notificationId: notificationId ? String(notificationId) : null,
          eventTypeNum: typeNum || null, timestamp: eventTimestamp,
          rawData: eventData, signatureValid: true, processed: false,
        },
      });
      webhookLogId = webhookLog.id;
    } catch (e: any) { console.error("[TikTok Webhook] 日志存储失败:", e.message); }

    // 异步处理：拉取完整订单详情
    // 不 await，让响应立即返回
    processEvent(typeNum, shopId, orderId, orderData).then(async () => {
      if (webhookLogId) {
        await prisma.tikTokWebhookLog.update({ where: { id: webhookLogId }, data: { processed: true } });
      }
    }).catch(async (e) => {
      console.error("[TikTok Webhook] 处理失败:", e.message);
      if (webhookLogId) {
        await prisma.tikTokWebhookLog.update({
          where: { id: webhookLogId },
          data: { processed: true, processError: String(e?.message || e) },
        }).catch(() => undefined);
      }
    });

    return NextResponse.json({ code: 0, message: "success" }, { status: 200 });
  } catch (error: any) {
    console.error("[TikTok Webhook] 全局错误:", error.message);
    return NextResponse.json({ code: 0, message: "ok" }, { status: 200 });
  }
}

/**
 * 处理事件：拉取完整订单详情并存储
 */
async function processEvent(typeNum: number, shopId: string | null, orderId: string | null, orderData: any) {
  if (!shopId || !orderId) return;

  // 只处理订单相关事件
  if (![1, 2, 3].includes(typeNum)) return;

  try {
    // 获取店铺信息（含 accessToken、shopCipher、appKey）
    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
    if (!shop || !shop.accessToken || !shop.shopCipher) {
      console.log(`[TikTok Webhook] 店铺 ${shopId} 未找到或未授权，跳过`);
      return;
    }

    // 获取 App 配置
    const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
    const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
    const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";

    // 检查 token 是否需要刷新
    let accessToken = shop.accessToken;
    if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
      console.log(`[TikTok Webhook] Token 过期，跳过详情拉取（等待定时同步刷新）`);
      // token 过期了，用 webhook 里的基本数据做个简单更新
      await updateOrderBasic(orderId, shopId, orderData);
      return;
    }

    // 拉取完整订单详情
    console.log(`[TikTok Webhook] 拉取订单详情: ${orderId}`);
    const detailData = await getOrderDetail(accessToken, shop.shopCipher, appKey, appSecret, [orderId]);
    const orders = detailData?.orders || [];

    if (orders.length > 0) {
      const o = orders[0];
      await prisma.tikTokOrder.upsert({
        where: { orderId: o.id },
        create: {
          shopId, orderId: o.id, status: o.status, orderStatus: o.status,
          totalAmount: o.payment?.total_amount || o.total_amount || null,
          currency: o.payment?.currency || o.currency || null,
          itemCount: o.line_items?.length || null,
          createTime: o.create_time ? new Date(o.create_time * 1000) : null,
          updateTime: o.update_time ? new Date(o.update_time * 1000) : null,
          rawData: o,
        },
        update: {
          status: o.status, orderStatus: o.status,
          totalAmount: o.payment?.total_amount || o.total_amount || null,
          currency: o.payment?.currency || o.currency || null,
          itemCount: o.line_items?.length || null,
          updateTime: o.update_time ? new Date(o.update_time * 1000) : null,
          rawData: o,
        },
      });
      console.log(`[TikTok Webhook] ✅ 订单 ${orderId} 已实时更新: ${o.status}`);

      // 扣减库存（待揽收 + 有物流信息时）
      try {
        const deductResult = await deductStockForOrder(orderId, shopId, o);
        if (deductResult.success) {
          const deducted = deductResult.results.filter((r: any) => r.status === "deducted");
          const noMapping = deductResult.results.filter((r: any) => r.status === "no_mapping");
          if (deducted.length > 0) {
            console.log(`[TikTok Stock] 订单 ${orderId} 扣减 ${deducted.length} 个SKU`);
          }
          if (noMapping.length > 0) {
            console.log(`[TikTok Stock] ⚠️ 订单 ${orderId} 有 ${noMapping.length} 个SKU未配置映射: ${noMapping.map((r:any) => r.sku).join(", ")}`);
          }
        }
      } catch (e: any) {
        console.error(`[TikTok Stock] 订单 ${orderId} 扣减失败:`, e.message);
      }
    } else {
      // API 没返回详情（可能订单太新），用 webhook 数据做基本更新
      await updateOrderBasic(orderId, shopId, orderData);
      console.log(`[TikTok Webhook] 订单 ${orderId} 暂无详情，已记录基本状态`);
    }
  } catch (e: any) {
    console.error(`[TikTok Webhook] 拉取订单 ${orderId} 详情失败:`, e.message);
  }
}

/** 用 webhook 数据做基本更新（token 过期或 API 无详情时） */
async function updateOrderBasic(orderId: string, shopId: string, orderData: any) {
  try {
    const existing = await prisma.tikTokOrder.findUnique({ where: { orderId } });
    if (existing) {
      await prisma.tikTokOrder.update({
        where: { orderId },
        data: {
          status: orderData.order_status || existing.status,
          updateTime: orderData.update_time ? new Date(orderData.update_time * 1000) : new Date(),
        },
      });
    }
  } catch {}
}

async function readStreamBytes(stream: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function GET() {
  return NextResponse.json({
    code: 0,
    message: "TikTok Webhook endpoint is active (实时拉取详情模式)",
    timestamp: new Date().toISOString(),
  });
}
