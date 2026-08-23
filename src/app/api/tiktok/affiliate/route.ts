import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAffiliateConversations,
  getAffiliateMessages,
  getAffiliateNewestMessages,
  sendAffiliateMessage,
  refreshAccessToken,
} from "@/lib/tiktok-shop-api";
import { decryptTikTokSecret, encryptTikTokSecret } from "@/lib/tiktok-secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/tiktok/affiliate?shopId=xxx&action=list
 *   action=list → 获取对话列表
 *   action=messages&conversationId=xxx → 获取对话消息
 *   action=newest → 获取最新未读消息
 *
 * POST /api/tiktok/affiliate
 *   { shopId, conversationId, content } → 发送消息
 */
async function getTokenAndConfig(shopId: string) {
  const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
  if (!shop || !shop.accessToken || !shop.shopCipher) throw new Error("店铺未授权");
  const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
  const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
  const appSecret = decryptTikTokSecret(appConfig?.appSecret) || process.env.TIKTOK_APP_SECRET || "";
  let accessToken = decryptTikTokSecret(shop.accessToken)!;
  if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60000)) {
    const refreshed = await refreshAccessToken(decryptTikTokSecret(shop.refreshToken)!, appKey, appSecret);
    accessToken = refreshed.accessToken;
    await prisma.tikTokShopSetting.update({
      where: { shopId },
      data: {
        accessToken: encryptTikTokSecret(refreshed.accessToken),
        refreshToken: encryptTikTokSecret(refreshed.refreshToken),
        tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
      },
    });
  }
  return { accessToken, shopCipher: shop.shopCipher, appKey, appSecret };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");
    const action = searchParams.get("action") || "list";

    if (!shopId) return NextResponse.json({ error: "缺少 shopId" }, { status: 400 });
    const { accessToken, shopCipher, appKey, appSecret } = await getTokenAndConfig(shopId);

    if (action === "list") {
      const data = await getAffiliateConversations(accessToken, shopCipher, appKey, appSecret, { page_size: 50 });
      return NextResponse.json({ success: true, conversations: data.conversations || [], hasMore: data.has_more });

    } else if (action === "messages") {
      const conversationId = searchParams.get("conversationId");
      if (!conversationId) return NextResponse.json({ error: "缺少 conversationId" }, { status: 400 });
      const data = await getAffiliateMessages(accessToken, shopCipher, appKey, appSecret, conversationId, { page_size: 20 });

      // 找出卖家的 sender_id：在多个对话中都出现的 sender_id 就是卖家
      // 先获取其他对话来对比
      const convData = await getAffiliateConversations(accessToken, shopCipher, appKey, appSecret, { page_size: 10 });
      const otherConvs = (convData.conversations || []).filter((c: any) => c.id !== conversationId).slice(0, 3);
      const senderFrequency: Record<string, number> = {};
      // 当前对话的sender
      for (const m of (data.messages || [])) {
        const sid = m.message_body?.sender_id;
        if (sid) senderFrequency[sid] = (senderFrequency[sid] || 0) + 1;
      }
      // 其他对话的sender（统计跨对话出现的）
      for (const c of otherConvs) {
        try {
          const otherData = await getAffiliateMessages(accessToken, shopCipher, appKey, appSecret, c.id, { page_size: 5 });
          for (const m of (otherData.messages || [])) {
            const sid = m.message_body?.sender_id;
            if (sid) senderFrequency[sid] = (senderFrequency[sid] || 0) + 1;
          }
        } catch {}
      }
      // 出现频率最高的就是卖家（卖家在所有对话中都出现）
      let sellerSenderId = "";
      let maxFreq = 0;
      for (const [sid, freq] of Object.entries(senderFrequency)) {
        if (freq > maxFreq) { maxFreq = freq; sellerSenderId = sid; }
      }

      const messages = (data.messages || []).map((m: any) => {
        let content = m.message_body?.content || "";
        try { const parsed = JSON.parse(content); content = parsed.content || content; } catch {}
        const senderId = m.message_body?.sender_id || "";
        return {
          conversationIndex: m.conversation_index,
          content,
          createTime: m.message_body?.create_time ? new Date(m.message_body.create_time * 1000).toISOString() : null,
          senderId,
          isFromSeller: senderId === sellerSenderId,
          type: m.message_body?.type || "TEXT",
        };
      }).reverse(); // 倒序排列（最新的在下面）
      return NextResponse.json({ success: true, messages, hasMore: data.has_more });

    } else if (action === "newest") {
      const data = await getAffiliateNewestMessages(accessToken, shopCipher, appKey, appSecret, { page_size: 20 });
      return NextResponse.json({ success: true, messages: data.newest_message_list || [] });
    }

    return NextResponse.json({ error: "未知 action" }, { status: 400 });
  } catch (error: any) {
    console.error("[TikTok Affiliate] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shopId, conversationId, content } = body;
    if (!shopId || !conversationId || !content) {
      return NextResponse.json({ error: "缺少 shopId、conversationId 或 content" }, { status: 400 });
    }
    const { accessToken, shopCipher, appKey, appSecret } = await getTokenAndConfig(shopId);
    const data = await sendAffiliateMessage(accessToken, shopCipher, appKey, appSecret, conversationId, content);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("[TikTok Affiliate Send] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
