import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUrl } from "@/lib/tiktok-shop-api";
import { randomUUID } from "crypto";
import { createHmac } from "crypto";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/tiktok/auth?appKey=xxx
 * 生成授权URL，可指定 appKey（多店铺场景）
 *
 * state 格式: {uuid}_{appKey}
 * TikTok 会原样返回 state，回调时解析出 appKey
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

    // state 里编码 appKey，格式: uuid_appKey
    const state = `${randomUUID().replace(/-/g, "").substring(0, 16)}_${appKey}`;
    const authUrl = getAuthUrl(state, appKey);

    return NextResponse.json({ authUrl, appKey, appName: config.appName });
  } catch (error: any) {
    console.error("[TikTok Auth] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
