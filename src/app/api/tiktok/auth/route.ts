import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUrl } from "@/lib/tiktok-shop-api";
import { randomUUID } from "crypto";
import { requireApiUser } from "@/lib/api-auth";
import { hashTikTokOAuthState } from "@/lib/tiktok-secrets";
import { recordTikTokAuthEvent } from "@/lib/tiktok-auth-audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/auth?appKey=xxx
 * 生成授权URL，可指定 appKey（多店铺场景）
 *
 * state 是一次性随机值；服务端只保存哈希，回调时从数据库取回 App 配置。
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    let appKey = searchParams.get("appKey");

    // 如果没传 appKey，取第一个可用的
    if (!appKey) {
      const config = await prisma.tikTokAppConfig.findFirst({
        where: { status: "active" },
        orderBy: { createdAt: "asc" },
      });
      appKey = config?.appKey || process.env.TIKTOK_APP_KEY || "";
    }

    // 验证 appKey 存在
    const config = await prisma.tikTokAppConfig.findUnique({ where: { appKey } });
    if (!config) {
      return NextResponse.json({ error: `App Key ${appKey} 不存在，请先在配置页面添加` }, { status: 400 });
    }

    // state 只作为一次性随机凭证，App Key 不再暴露在回调参数中。
    const state = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    await prisma.tikTokOAuthState.create({
      data: {
        stateHash: hashTikTokOAuthState(state),
        appKey,
        userId: auth.user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    await recordTikTokAuthEvent({ eventType: "AUTHORIZE_STARTED", status: "INFO", appKey, userId: auth.user.id });
    const authUrl = getAuthUrl(state, appKey);

    return NextResponse.json({ authUrl, appKey, appName: config.appName });
  } catch (error: any) {
    console.error("[TikTok Auth] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
