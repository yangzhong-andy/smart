import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SHOPEE_ORDER_EVENT_CODES = new Set([3, 4]);
export const SHOPEE_WEBHOOK_URL =
  process.env.SHOPEE_WEBHOOK_URL || "https://www.baxi8.com/api/shopee/webhook";

export function shopeeWebhookUrlCandidates(configuredUrl: string) {
  const candidates = new Set<string>([configuredUrl]);
  try {
    const parsed = new URL(configuredUrl);
    const hosts = new Set([parsed.hostname]);
    if (parsed.hostname.startsWith("www.")) {
      hosts.add(parsed.hostname.slice(4));
    } else {
      hosts.add(`www.${parsed.hostname}`);
    }
    const paths = new Set([
      parsed.pathname,
      parsed.pathname.endsWith("/") ? parsed.pathname.slice(0, -1) : `${parsed.pathname}/`,
    ]);
    for (const protocol of ["https:", "http:"]) {
      for (const hostname of hosts) {
        for (const pathname of paths) {
          const candidate = new URL(parsed.toString());
          candidate.protocol = protocol;
          candidate.hostname = hostname;
          candidate.pathname = pathname || "/";
          candidates.add(candidate.toString());
        }
      }
    }
  } catch {
    // Keep the configured value as the sole candidate if it is not a valid URL.
  }
  return [...candidates];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function eventDate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const date = new Date(number > 10_000_000_000 ? number : number * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function signShopeeWebhook(partnerKey: string, callbackUrl: string, rawBody: string) {
  return createHmac("sha256", partnerKey)
    .update(`${callbackUrl}|${rawBody}`)
    .digest("hex");
}

export function verifyShopeeWebhookSignature(input: {
  partnerKey: string;
  callbackUrl: string;
  rawBody: string;
  authorization: string | null;
}) {
  const received = (input.authorization || "")
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  const expected = signShopeeWebhook(input.partnerKey, input.callbackUrl, input.rawBody);
  return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

export function matchShopeeWebhookSignature(input: {
  partnerKey: string;
  configuredUrl: string;
  rawBody: string;
  authorization: string | null;
}) {
  for (const callbackUrl of shopeeWebhookUrlCandidates(input.configuredUrl)) {
    if (verifyShopeeWebhookSignature({
      partnerKey: input.partnerKey,
      callbackUrl,
      rawBody: input.rawBody,
      authorization: input.authorization,
    })) {
      return callbackUrl;
    }
  }
  return null;
}

export function isShopeeWebhookVerificationPayload(payload: unknown) {
  const root = record(payload);
  const data = record(root.data);
  return firstNumber(root.code) === 0
    && typeof data.verify_info === "string"
    && data.verify_info.trim().length > 0;
}

export function parseShopeeWebhookPayload(payload: unknown) {
  const root = record(payload);
  const data = record(root.data);
  const code = firstNumber(root.code, root.event_code, data.code);
  const timestamp = firstNumber(
    root.timestamp,
    root.event_timestamp,
    data.update_time,
    data.event_time,
    data.timestamp,
  );
  return {
    code: code === null ? null : Math.trunc(code),
    shopId: firstString(root.shop_id, root.shopid, data.shop_id, data.shopid),
    orderSn: firstString(
      data.ordersn,
      data.order_sn,
      data.orderSn,
      root.ordersn,
      root.order_sn,
      root.orderSn,
    ),
    status: firstString(data.status, data.order_status, root.status, root.order_status),
    messageId: firstString(root.msg_id, root.message_id, root.messageId, data.msg_id, data.message_id),
    eventTimestamp: eventDate(timestamp),
  };
}

export function shopeeWebhookEventKey(appConfigId: string, rawBody: string) {
  return createHash("sha256").update(`${appConfigId}|${rawBody}`).digest("hex");
}
