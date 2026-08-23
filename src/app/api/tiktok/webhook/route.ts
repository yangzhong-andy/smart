import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { Buffer } from "buffer";
import { decryptTikTokSecret } from "@/lib/tiktok-secrets";
import { processTikTokWebhookEvent } from "@/lib/tiktok-webhook-processor";

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

function buildSignature(appKey: string, appSecret: string, rawBytes: Buffer): string {
  // TikTok Shop signs the exact bytes of `app_key + raw request body`.
  return createHmac("sha256", appSecret)
    .update(Buffer.concat([Buffer.from(appKey, "utf-8"), rawBytes]))
    .digest("hex");
}

async function getWebhookCredentials(shopId: string | null): Promise<{ appKey: string; appSecret: string }> {
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
    return {
      appKey: appConfig?.appKey || shop?.appKey || process.env.TIKTOK_APP_KEY || "",
      appSecret: decryptTikTokSecret(appConfig?.appSecret) || process.env.TIKTOK_APP_SECRET || "",
    };
  } catch (error) {
    console.error("[TikTok Webhook] failed to resolve app secret:", error);
    return { appKey: "", appSecret: "" };
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

    const { appKey, appSecret } = await getWebhookCredentials(shopId);
    const signatureHeaders: Array<[string, string | null]> = [
      // TikTok sends this header on the current webhook protocol.
      ["x-tt-signature", request.headers.get("x-tt-signature")],
      ["x-tts-signature", request.headers.get("x-tts-signature")],
      ["authorization", request.headers.get("authorization")],
    ];
    const signatureCandidates = appKey && appSecret
      ? [buildSignature(appKey, appSecret, rawBytes)]
      : [];
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
    processTikTokWebhookEvent(typeNum, shopId, orderId, orderData).then(async () => {
      if (webhookLogId) {
        await prisma.tikTokWebhookLog.update({
          where: { id: webhookLogId },
          data: { processed: true, processError: null },
        });
      }
    }).catch(async (e) => {
      console.error("[TikTok Webhook] 处理失败:", e.message);
      if (webhookLogId) {
        await prisma.tikTokWebhookLog.update({
          where: { id: webhookLogId },
          // Keep failed events retryable. A received webhook is not the same
          // as a successfully persisted order detail.
          data: { processed: false, processError: String(e?.message || e) },
        }).catch(() => undefined);
      }
    });

    return NextResponse.json({ code: 0, message: "success" }, { status: 200 });
  } catch (error: any) {
    console.error("[TikTok Webhook] 全局错误:", error.message);
    return NextResponse.json({ code: 0, message: "ok" }, { status: 200 });
  }
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
