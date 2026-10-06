import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { getShopVideoList, refreshAccessToken } from "@/lib/tiktok-shop-api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function nextDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function cleanUsername(value: unknown) {
  return String(value || "").trim().replace(/^@+/, "").trim();
}

async function loadShopVideos(shopId: string, startDate: string, endDate: string) {
  const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
  if (!shop?.accessToken || !shop.shopCipher) throw new Error("店铺未授权");

  const appConfig = shop.appKey ? await prisma.tikTokAppConfig.findUnique({ where: { appKey: shop.appKey } }) : null;
  const appKey = appConfig?.appKey || process.env.TIKTOK_APP_KEY || "";
  const appSecret = appConfig?.appSecret || process.env.TIKTOK_APP_SECRET || "";
  let accessToken = shop.accessToken;
  if (shop.tokenExpireAt && shop.tokenExpireAt < new Date(Date.now() + 60_000)) {
    if (!shop.refreshToken) throw new Error("店铺授权已过期，请重新授权");
    const refreshed = await refreshAccessToken(shop.refreshToken, appKey, appSecret);
    accessToken = refreshed.accessToken;
    await prisma.tikTokShopSetting.update({ where: { shopId }, data: {
      accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken,
      tokenExpireAt: new Date(Date.now() + refreshed.accessTokenExpireIn * 1000),
    } });
  }

  const videos: any[] = [];
  let pageToken: string | undefined;
  let latestAvailableDate: string | null = null;
  const seenTokens = new Set<string>();
  for (let calls = 0; calls < 1_000; calls += 1) {
    const response = await getShopVideoList(accessToken, shop.shopCipher, appKey, appSecret, {
      start_date_ge: startDate, end_date_lt: nextDay(endDate), page_size: 100, page_token: pageToken,
    });
    latestAvailableDate = latestAvailableDate || response?.latest_available_date || null;
    if (Array.isArray(response?.videos)) videos.push(...response.videos);
    const next = typeof response?.next_page_token === "string" ? response.next_page_token : "";
    if (!next || seenTokens.has(next)) break;
    seenTokens.add(next);
    pageToken = next;
  }
  return { shop, videos, latestAvailableDate };
}

/** Create a store-owned TikTok channel account from the operations UI. */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const shopId = String(body?.shopId || "").trim();
    const action = String(body?.action || "").trim();
    if (action === "discover") {
      const startDate = String(body?.startDate || "").trim();
      const endDate = String(body?.endDate || "").trim();
      if (!shopId || !DATE.test(startDate) || !DATE.test(endDate) || startDate > endDate) {
        return NextResponse.json({ error: "请选择店铺和有效的日期范围" }, { status: 400 });
      }
      const { videos, latestAvailableDate } = await loadShopVideos(shopId, startDate, endDate);
      const usernames = [...new Set(videos.map((video) => cleanUsername(video?.username)).filter(Boolean))];
      const existing = await prisma.tikTokChannel.findMany({ where: { shopId }, select: { username: true } });
      const existingNames = new Set(existing.map((channel) => channel.username.toLowerCase()));
      const newUsernames = usernames.filter((name) => !existingNames.has(name.toLowerCase()));
      if (newUsernames.length) {
        await prisma.tikTokChannel.createMany({
          data: newUsernames.map((username) => ({ shopId, username, remark: "官方视频接口自动发现" })),
          skipDuplicates: true,
        });
      }
      return NextResponse.json({ success: true, discovered: usernames.length, imported: newUsernames.length, latestAvailableDate, usernames: newUsernames });
    }
    const username = cleanUsername(body?.username);
    const remark = String(body?.remark || "").trim();
    if (!shopId || !username) {
      return NextResponse.json({ error: "请选择店铺并填写 TikTok 账号" }, { status: 400 });
    }
    if (username.length > 100) {
      return NextResponse.json({ error: "TikTok 账号不能超过 100 个字符" }, { status: 400 });
    }
    const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true } });
    if (!shop) return NextResponse.json({ error: "店铺不存在或尚未完成授权" }, { status: 404 });

    const channel = await prisma.tikTokChannel.create({
      data: { shopId, username, remark: remark || null },
    });
    return NextResponse.json({ success: true, channel }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "这个账号已经在该店铺登记过了" }, { status: 409 });
    }
    console.error("[TikTok Self Channel Create]", error);
    return NextResponse.json({ error: "新增自营账号失败" }, { status: 500 });
  }
}

/** Remove a store-owned TikTok channel account from the operations UI. */
export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ error: "缺少账号配置 ID" }, { status: 400 });
    await prisma.tikTokChannel.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "账号配置不存在" }, { status: 404 });
    console.error("[TikTok Self Channel Delete]", error);
    return NextResponse.json({ error: "删除自营账号失败" }, { status: 500 });
  }
}

/**
 * Official TikTok Shop video analytics for accounts explicitly configured as
 * store-owned channels. Video statistics are intentionally kept separate from
 * affiliate order attribution because TikTok does not expose channel video ID
 * on individual order records.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId") || "";
    const configOnly = searchParams.get("config") === "true";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || 30)));
    if (configOnly) {
      const configuredChannels = await prisma.tikTokChannel.findMany({ orderBy: [{ shopId: "asc" }, { username: "asc" }] });
      const shops = await prisma.tikTokShopSetting.findMany({
        select: { shopId: true, shopName: true, region: true },
        orderBy: { shopName: "asc" },
      });
      return NextResponse.json({ success: true, shops, channels: configuredChannels });
    }
    if (!shopId || !DATE.test(startDate) || !DATE.test(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "请选择店铺和有效的日期范围" }, { status: 400 });
    }

    const [shop, channels] = await Promise.all([
      prisma.tikTokShopSetting.findUnique({ where: { shopId } }),
      prisma.tikTokChannel.findMany({ where: { shopId }, orderBy: { username: "asc" } }),
    ]);
    if (!shop?.accessToken || !shop.shopCipher) return NextResponse.json({ error: "店铺未授权" }, { status: 400 });
    if (!channels.length) return NextResponse.json({
      success: true, channels: [], summary: [], videos: [], pagination: { page, pageSize, total: 0, totalPages: 1 },
      latestAvailableDate: null, note: "该店铺尚未配置自营渠道号。",
    });

    const channelNames = new Set(channels.map((channel) => channel.username.toLowerCase()));
    const { videos: rawVideos, latestAvailableDate } = await loadShopVideos(shopId, startDate, endDate);
    const allVideos = rawVideos.filter((video) => channelNames.has(cleanUsername(video?.username).toLowerCase()));

    const videos = allVideos.map((video) => ({
      id: String(video.id), username: String(video.username || ""), title: String(video.title || "").slice(0, 100),
      postTime: video.video_post_time || null, views: asNumber(video.views), likes: asNumber(video.likes),
      gmv: asNumber(video.gmv?.amount), currency: video.gmv?.currency || "", itemsSold: asNumber(video.items_sold),
      skuOrders: asNumber(video.sku_orders), productClicks: asNumber(video.product_clicks),
      clickThroughRate: asNumber(video.click_through_rate), productName: String(video.products?.[0]?.name || "").slice(0, 80),
    })).sort((left, right) => right.gmv - left.gmv || right.views - left.views);
    const summary = channels.map((channel) => {
      const rows = videos.filter((video) => video.username.toLowerCase() === channel.username.toLowerCase());
      const currency = rows.find((video) => video.currency)?.currency || "";
      return { username: channel.username, remark: channel.remark, videoCount: rows.length, currency,
        gmv: rows.reduce((sum, video) => sum + video.gmv, 0), itemsSold: rows.reduce((sum, video) => sum + video.itemsSold, 0),
        skuOrders: rows.reduce((sum, video) => sum + video.skuOrders, 0), views: rows.reduce((sum, video) => sum + video.views, 0),
      };
    });
    const total = videos.length;
    return NextResponse.json({ success: true, shop: { shopId: shop.shopId, shopName: shop.shopName }, channels, summary,
      videos: videos.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }, latestAvailableDate,
      note: "数据来自 TikTok 官方店铺视频分析接口，仅统计系统已配置的自营渠道号；官方接口未提供视频到订单号的逐单映射。",
    });
  } catch (error: any) {
    console.error("[TikTok Self Channel Performance]", error);
    return NextResponse.json({ error: error?.message || "自营渠道号数据加载失败" }, { status: 500 });
  }
}
