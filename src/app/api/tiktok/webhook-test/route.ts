import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/tiktok/webhook-test
 * 用正确的签名发送测试请求，验证签名算法是否正确
 *
 * 用法：
 *   curl -X POST https://www.baxi8.com/api/tiktok/webhook-test \
 *     -H "Authorization: <signature>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"type":1,"shop_id":"test","data":{}}'
 *
 * 先 GET 这个端点获取正确签名，再用该签名 POST 到 webhook
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["ADMIN", "SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  const shop = await prisma.tikTokShopSetting.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { shopId: true, appKey: true },
  });
  const shopId = shop?.shopId || "test-shop";
  const appKey = shop?.appKey || process.env.TIKTOK_APP_KEY || "";
  const appConfig = appKey
    ? await prisma.tikTokAppConfig.findUnique({ where: { appKey }, select: { appSecret: true } })
    : null;
  const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";

  // 模拟 TikTok 会发送的数据
  const testBody = JSON.stringify({
    data: { order_id: "TEST_ORDER_123", order_status: "COMPLETED" },
    type: 1,
    shop_id: shopId,
    timestamp: Math.floor(Date.now() / 1000),
    tts_notification_id: "test-" + Date.now(),
  });

  // 计算正确签名
  const correctSig = createHmac("sha256", appSecret)
    .update(`${appKey}${testBody}`)
    .digest("hex");

  return NextResponse.json({
    message: "使用以下命令测试 webhook 签名验证",
    testBody,
    correctSignature: correctSig,
    authHeader: correctSig, // 直接放在 Authorization header
    curlCommand: `curl -X POST https://www.baxi8.com/api/tiktok/webhook \\
  -H "Authorization: ${correctSig}" \\
  -H "Content-Type: application/json" \\
  -d '${testBody}'`,
  });
}
