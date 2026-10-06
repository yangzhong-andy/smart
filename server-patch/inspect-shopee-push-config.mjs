import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const apps = await prisma.shopeeAppConfig.findMany({ where: { status: "active", environment: "live" } });
  for (const app of apps) {
    const path = "/api/v2/push/get_app_push_config";
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = createHmac("sha256", app.partnerKey)
      .update(`${app.partnerId}${path}${timestamp}`)
      .digest("hex");
    const params = new URLSearchParams({ partner_id: app.partnerId, timestamp: String(timestamp), sign });
    const response = await fetch(`https://openplatform.shopee.com.br${path}?${params}`);
    const payload = await response.json();
    console.log(JSON.stringify({ appName: app.appName, partnerId: app.partnerId, status: response.status, payload }));
  }
} finally {
  await prisma.$disconnect();
}
