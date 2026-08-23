import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { processTikTokWebhookEvent } from "@/lib/tiktok-webhook-processor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Retry failed webhook detail processing without asking TikTok to resend it. */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["ADMIN", "SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body?.limit || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.floor(requestedLimit))) : 50;
  const logs = await prisma.tikTokWebhookLog.findMany({
    where: {
      OR: [
        { processed: false },
        { processError: { not: null } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const results: Array<Record<string, unknown>> = [];
  for (const log of logs) {
    const raw = log.rawData as any;
    const typeNum = typeof raw?.type === "number" ? raw.type : parseInt(raw?.type);
    const shopId = log.shopId || raw?.shop_id || null;
    const orderData = raw?.data || {};
    const orderId = orderData?.order_id || null;
    if (!shopId || !orderId || ![1, 2, 3].includes(typeNum)) {
      results.push({ id: log.id, status: "skipped", reason: "缺少店铺、订单号或不支持的事件类型" });
      continue;
    }

    try {
      await processTikTokWebhookEvent(typeNum, shopId, orderId, orderData);
      await prisma.tikTokWebhookLog.update({
        where: { id: log.id },
        data: { processed: true, processError: null },
      });
      results.push({ id: log.id, orderId, status: "processed" });
    } catch (error: any) {
      const message = String(error?.message || error);
      await prisma.tikTokWebhookLog.update({
        where: { id: log.id },
        data: { processed: false, processError: message },
      });
      results.push({ id: log.id, orderId, status: "failed", error: message });
    }
  }

  return NextResponse.json({ success: true, attempted: results.length, results });
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["ADMIN", "SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  const [pending, failed] = await Promise.all([
    prisma.tikTokWebhookLog.count({ where: { processed: false } }),
    prisma.tikTokWebhookLog.count({ where: { processError: { not: null } } }),
  ]);
  return NextResponse.json({ pending, failed });
}
