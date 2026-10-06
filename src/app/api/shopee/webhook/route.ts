import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  isShopeeWebhookVerificationPayload,
  matchShopeeWebhookSignature,
  parseShopeeWebhookPayload,
  SHOPEE_ORDER_EVENT_CODES,
  SHOPEE_WEBHOOK_URL,
  shopeeWebhookEventKey,
} from "@/lib/shopee-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Shopee uses code 0 only to verify that the callback is reachable. The
  // handshake has no side effects and must receive a 2xx response with no body.
  if (isShopeeWebhookVerificationPayload(payload)) {
    return new NextResponse(null, { status: 204 });
  }

  const authorization = request.headers.get("authorization");
  const apps = await prisma.shopeeAppConfig.findMany({
    where: { status: "active" },
    select: { id: true, partnerKey: true },
  });
  let matchedUrl: string | null = null;
  const app = apps.find((candidate) => {
    matchedUrl = matchShopeeWebhookSignature({
      partnerKey: candidate.partnerKey,
      configuredUrl: SHOPEE_WEBHOOK_URL,
      rawBody,
      authorization,
    });
    return Boolean(matchedUrl);
  });
  if (!app) {
    const diagnosticCode = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { code?: unknown }).code ?? null
      : null;
    console.warn("[Shopee Webhook] rejected request with an invalid signature", {
      authorizationLength: authorization?.length || 0,
      authorizationFormat: authorization
        ? (/^[a-f0-9]{64}$/i.test(authorization) ? "hex" : authorization.slice(0, 12))
        : "missing",
      code: diagnosticCode,
      bodyBytes: Buffer.byteLength(rawBody),
    });
    return NextResponse.json({ error: "Invalid Shopee webhook signature" }, { status: 401 });
  }
  if (matchedUrl !== SHOPEE_WEBHOOK_URL) {
    console.info("[Shopee Webhook] accepted URL signature compatibility variant", {
      matchedUrl,
    });
  }
  const event = parseShopeeWebhookPayload(payload);
  const supported = event.code !== null && SHOPEE_ORDER_EVENT_CODES.has(event.code);
  const shop = supported && event.shopId
    ? await prisma.shopeeShopSetting.findFirst({
      where: { appConfigId: app.id, shopId: event.shopId, status: "active" },
      select: { id: true, currency: true },
    })
    : null;
  const status = supported && shop && event.orderSn ? "pending" : "ignored";
  const eventKey = shopeeWebhookEventKey(app.id, rawBody);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shopeeWebhookLog.create({
        data: {
          appConfigId: app.id,
          eventKey,
          messageId: event.messageId,
          code: event.code,
          shopId: event.shopId,
          orderSn: event.orderSn,
          signatureValid: true,
          status,
          rawData: payload as Prisma.InputJsonValue,
          eventTimestamp: event.eventTimestamp,
          ...(status === "ignored" ? { processedAt: new Date() } : {}),
        },
      });
      if (status === "pending" && shop && event.shopId && event.orderSn) {
        await tx.shopeeOrder.upsert({
          where: { shopId_orderSn: { shopId: event.shopId, orderSn: event.orderSn } },
          create: {
            shopSettingId: shop.id,
            shopId: event.shopId,
            orderSn: event.orderSn,
            status: event.status,
            currency: shop.currency,
            updateTime: event.eventTimestamp,
            rawData: payload as Prisma.InputJsonValue,
          },
          update: {
            ...(event.status ? { status: event.status } : {}),
            ...(event.eventTimestamp ? { updateTime: event.eventTimestamp } : {}),
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new NextResponse(null, { status: 204 });
    }
    console.error("[Shopee Webhook] failed to persist event", error);
    return NextResponse.json({ error: "Could not persist Shopee webhook event" }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
