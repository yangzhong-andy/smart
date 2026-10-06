import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncShopeeOrderBySn } from "@/lib/shopee-order-sync";
import { reconcileShopeeWarehouseFeeForOrder } from "@/lib/warehouse-fund-reconciliation";
import {
  confirmShopeeLostPushMessages,
  getShopeeLostPushMessages,
  ShopeeApiError,
  type ShopeeEnvironment,
  type ShopeePartnerRequestInput,
} from "@/lib/shopee-open-api";
import {
  parseShopeeWebhookPayload,
  SHOPEE_ORDER_EVENT_CODES,
  shopeeWebhookEventKey,
} from "@/lib/shopee-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = 10;
const MAX_LOST_PUSH_PAGES = 10;
const LOST_PUSH_RETRY_DELAYS_MS = [0, 500, 1_500];

async function canProcess(request: NextRequest) {
  const internalToken = request.headers.get("x-shopee-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (internalToken && process.env.NEXTAUTH_SECRET && internalToken === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || "Shopee webhook processing failed"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLostPushMessagesWithRetry(input: ShopeePartnerRequestInput) {
  let lastError: unknown;
  for (const delay of LOST_PUSH_RETRY_DELAYS_MS) {
    if (delay) await sleep(delay);
    try {
      return await getShopeeLostPushMessages(input);
    } catch (error) {
      lastError = error;
      if (!(error instanceof ShopeeApiError) || error.code !== "error_server") throw error;
    }
  }
  throw lastError;
}

async function recoverLostPushMessages() {
  const apps = await prisma.shopeeAppConfig.findMany({
    where: { status: "active" },
    select: { id: true, partnerId: true, partnerKey: true, environment: true },
  });
  let recovered = 0;
  let confirmedPages = 0;
  const errors: Array<{ partnerId: string; error: string }> = [];

  for (const app of apps) {
    const input: ShopeePartnerRequestInput = {
      partnerId: app.partnerId,
      partnerKey: app.partnerKey,
      environment: app.environment as ShopeeEnvironment,
    };
    try {
      for (let page = 0; page < MAX_LOST_PUSH_PAGES; page += 1) {
        const response = await getLostPushMessagesWithRetry(input);
        const messages = response.push_message_list || [];
        for (const message of messages) {
          const rawBody = typeof message.data === "string" ? message.data : JSON.stringify(message);
          let payload: Record<string, unknown>;
          try {
            const parsed = JSON.parse(rawBody);
            payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
          } catch {
            payload = {};
          }
          payload = {
            ...payload,
            ...(payload.code === undefined && message.code !== undefined ? { code: message.code } : {}),
            ...(payload.shop_id === undefined && message.shop_id !== undefined ? { shop_id: message.shop_id } : {}),
            ...(payload.timestamp === undefined && message.timestamp !== undefined ? { timestamp: message.timestamp } : {}),
          };
          const event = parseShopeeWebhookPayload(payload);
          const supported = event.code !== null && SHOPEE_ORDER_EVENT_CODES.has(event.code);
          const status = supported && event.shopId && event.orderSn ? "pending" : "ignored";
          const created = await prisma.shopeeWebhookLog.createMany({
            data: [{
              appConfigId: app.id,
              eventKey: shopeeWebhookEventKey(app.id, rawBody),
              messageId: event.messageId,
              code: event.code,
              shopId: event.shopId,
              orderSn: event.orderSn,
              signatureValid: true,
              status,
              rawData: payload as Prisma.InputJsonValue,
              eventTimestamp: event.eventTimestamp,
              ...(status === "ignored" ? { processedAt: new Date() } : {}),
            }],
            skipDuplicates: true,
          });
          recovered += created.count;
        }
        if (messages.length > 0 && Number.isInteger(response.last_message_id)) {
          await confirmShopeeLostPushMessages({ ...input, lastMessageId: response.last_message_id as number });
          confirmedPages += 1;
        }
        if (!response.has_next_page || messages.length === 0) break;
      }
    } catch (error) {
      errors.push({ partnerId: app.partnerId, error: safeError(error) });
    }
  }
  return { recovered, confirmedPages, errors };
}

export async function POST(request: NextRequest) {
  if (!(await canProcess(request))) {
    return NextResponse.json({ error: "没有权限处理 Shopee 推送" }, { status: 403 });
  }
  const recovery = await recoverLostPushMessages();
  const events = await prisma.shopeeWebhookLog.findMany({
    where: { status: { in: ["pending", "failed"] }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { receivedAt: "asc" },
    take: 50,
    select: { id: true, appConfigId: true, shopId: true, orderSn: true },
  });
  let processed = 0;
  let failed = 0;
  let ignored = 0;
  for (const event of events) {
    const claimed = await prisma.shopeeWebhookLog.updateMany({
      where: { id: event.id, status: { in: ["pending", "failed"] }, attempts: { lt: MAX_ATTEMPTS } },
      data: { status: "processing", attempts: { increment: 1 }, lastError: null },
    });
    if (claimed.count === 0) continue;
    try {
      if (!event.shopId || !event.orderSn) {
        await prisma.shopeeWebhookLog.update({
          where: { id: event.id },
          data: { status: "ignored", processedAt: new Date(), lastError: "Missing shop_id or order_sn" },
        });
        ignored += 1;
        continue;
      }
      const shop = await prisma.shopeeShopSetting.findFirst({
        where: { appConfigId: event.appConfigId, shopId: event.shopId, status: "active" },
        select: { id: true },
      });
      if (!shop) {
        await prisma.shopeeWebhookLog.update({
          where: { id: event.id },
          data: { status: "ignored", processedAt: new Date(), lastError: "No active authorization for this shop" },
        });
        ignored += 1;
        continue;
      }
      await syncShopeeOrderBySn({ shopSettingId: shop.id, orderSn: event.orderSn });
      const syncedOrder = await prisma.shopeeOrder.findUnique({
        where: { shopId_orderSn: { shopId: event.shopId, orderSn: event.orderSn } },
        select: { createTime: true, shopSetting: { select: { region: true } } },
      });
      if (syncedOrder?.createTime) {
        await reconcileShopeeWarehouseFeeForOrder(
          new URL(request.url).origin,
          event.orderSn,
          event.shopId,
          syncedOrder.createTime,
          syncedOrder.shopSetting.region,
        );
      }
      await prisma.shopeeWebhookLog.update({
        where: { id: event.id },
        data: { status: "processed", processedAt: new Date(), lastError: null },
      });
      processed += 1;
    } catch (error) {
      await prisma.shopeeWebhookLog.update({
        where: { id: event.id },
        data: { status: "failed", lastError: safeError(error) },
      });
      failed += 1;
    }
  }
  const success = failed === 0 && recovery.errors.length === 0;
  return NextResponse.json({
    success,
    recovery,
    selected: events.length,
    processed,
    failed,
    ignored,
  }, { status: success ? 200 : 502 });
}
