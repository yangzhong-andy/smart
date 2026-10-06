import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const CALLBACK_URL = "https://www.baxi8.com/api/shopee/webhook";
const ORDER_PUSH_CODES = [3, 4];
const prisma = new PrismaClient();

async function request(app, method, path, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = createHmac("sha256", app.partnerKey)
    .update(`${app.partnerId}${path}${timestamp}`)
    .digest("hex");
  const params = new URLSearchParams({
    partner_id: app.partnerId,
    timestamp: String(timestamp),
    sign,
  });
  const response = await fetch(`https://openplatform.shopee.com.br${path}?${params}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(`${path} failed: ${payload.error || response.status} ${payload.message || ""}`.trim());
  }
  return payload.response || payload;
}

try {
  const apps = await prisma.shopeeAppConfig.findMany({
    where: { status: "active", environment: "live" },
  });
  for (const app of apps) {
    await request(app, "POST", "/api/v2/push/set_app_push_config", {
      callback_url: CALLBACK_URL,
      set_push_config_on: ORDER_PUSH_CODES,
      set_push_config_off: [],
      blocked_shop_id_list: [],
    });
    const config = await request(app, "GET", "/api/v2/push/get_app_push_config");
    console.log(JSON.stringify({ appName: app.appName, partnerId: app.partnerId, config }));
  }
} finally {
  await prisma.$disconnect();
}
