import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeTikTokTokenLifetime } from "@/lib/tiktok-token-expiry";
import { decryptTikTokSecret } from "@/lib/tiktok-secrets";

const BASE_URL = "https://open-api.tiktokglobalshop.com";
const AUTH_URL = "https://auth.tiktok-shops.com";

/** 从数据库获取 App 配置，找不到则回退到 .env */
async function getAppConfig(appKey?: string) {
  if (appKey) {
    const config = await prisma.tikTokAppConfig.findUnique({
      where: { appKey },
    });
    if (config) {
      return { appKey: config.appKey, appSecret: decryptTikTokSecret(config.appSecret) || "" };
    }
  }
  // 回退到 .env 默认配置
  return {
    appKey: process.env.TIKTOK_APP_KEY || "",
    appSecret: process.env.TIKTOK_APP_SECRET || "",
  };
}

/** 获取回调地址 */
function getRedirectUri() {
  return process.env.TIKTOK_REDIRECT_URI || "https://www.baxi8.com/api/tiktok/callback";
}

/**
 * 生成签名
 * GET:  {secret}{path}{sorted_params}{secret}
 * POST: {secret}{path}{sorted_params}{body}{secret}
 */
export function generateSign(
  path: string,
  params: Record<string, string>,
  appSecret: string,
  body?: string
): string {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${k}${params[k]}`).join("");
  let signString = `${appSecret}${path}${paramString}`;
  if (body) signString += body;
  signString += appSecret;
  return createHmac("sha256", appSecret).update(signString).digest("hex");
}

/** 生成授权URL */
export function getAuthUrl(state: string, appKey: string) {
  return `https://services.tiktokshop.com/open/authorize?app_key=${appKey}&state=${state}`;
}

/** 获取 AccessToken */
export async function getAccessToken(authCode: string, appKey: string, appSecret: string) {
  const params = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    auth_code: authCode,
    grant_type: "authorized_code",
  });
  const url = `${AUTH_URL}/api/v2/token/get?${params.toString()}`;
  console.log("[TikTok] token_get appKey:", appKey);
  const res = await fetch(url);
  const data = await res.json();
  console.log("[TikTok] token_get response code:", data.code);
  if (data.code !== 0) throw new Error(`Token: ${data.message}`);
  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    accessTokenExpireIn: normalizeTikTokTokenLifetime(data.data.access_token_expire_in),
    refreshTokenExpireIn: normalizeTikTokTokenLifetime(data.data.refresh_token_expire_in),
    openId: data.data.open_id,
  };
}

/** 刷新 AccessToken */
export async function refreshAccessToken(refreshToken: string, appKey: string, appSecret: string) {
  const params = new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const url = `${AUTH_URL}/api/v2/token/refresh?${params.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code !== 0) throw new Error(`Refresh: ${data.message}`);
  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    accessTokenExpireIn: normalizeTikTokTokenLifetime(data.data.access_token_expire_in),
    refreshTokenExpireIn: normalizeTikTokTokenLifetime(data.data.refresh_token_expire_in),
    openId: data.data.open_id,
  };
}

/** 通用 API 调用 */
export async function callTikTokApi(
  path: string,
  accessToken: string,
  appKey: string,
  appSecret: string,
  options: {
    method?: "GET" | "POST";
    body?: any;
    query?: Record<string, string>;
  } = {}
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signParams: Record<string, string> = {
    app_key: appKey,
    timestamp,
    ...(options.query || {}),
  };

  const bodyStr = options.body ? JSON.stringify(options.body) : undefined;
  const sign = generateSign(path, signParams, appSecret, bodyStr);

  const allParams = { ...signParams, sign };
  const queryString = Object.keys(allParams)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(allParams[k])}`)
    .join("&");
  const url = `${BASE_URL}${path}?${queryString}`;

  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      "x-tts-access-token": accessToken,
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  const text = await res.text();
  console.log(`[TikTok API] ${options.method || "GET"} ${path} → ${res.status}`);

  if (!res.ok) throw new Error(`API ${res.status}: ${text.substring(0, 200)}`);
  const data = JSON.parse(text);
  if (data.code !== 0) throw new Error(`API code ${data.code}: ${data.message}`);
  return data.data;
}

// ==================== 店铺相关 ====================

/** 获取已授权店铺列表 */
export async function getAuthorizedShops(accessToken: string, appKey: string, appSecret: string) {
  const data = await callTikTokApi("/authorization/202309/shops", accessToken, appKey, appSecret);
  return data?.shops || [];
}

// ==================== 订单相关 ====================

export async function searchOrders(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: {
    page_size?: number;
    page_token?: string;
    update_time_ge?: number;
    update_time_lt?: number;
    sort_field?: "create_time" | "update_time";
    sort_order?: "ASC" | "DESC";
  } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(params.page_size || 50),
    sort_field: params.sort_field || "update_time",
    sort_order: params.sort_order || "DESC",
  };
  if (params.page_token) query.page_token = params.page_token;
  const body: any = {};
  if (params.update_time_ge !== undefined || params.update_time_lt !== undefined) {
    body.update_time = {};
    if (params.update_time_ge !== undefined) body.update_time.start = params.update_time_ge;
    if (params.update_time_lt !== undefined) body.update_time.end = params.update_time_lt;
  }
  const data = await callTikTokApi("/order/202309/orders/search", accessToken, appKey, appSecret, {
    method: "POST", query, body: Object.keys(body).length > 0 ? body : {},
  });
  return data;
}

/** 获取订单详情 GET /order/202309/orders */
export async function getOrderDetail(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  orderIds: string[]
) {
  const data = await callTikTokApi("/order/202309/orders", accessToken, appKey, appSecret, {
    method: "GET",
    query: {
      shop_cipher: shopCipher,
      ids: JSON.stringify(orderIds),
      page_size: String(orderIds.length),
    },
  });
  return data;
}

// ==================== 财务相关 ====================

export async function getStatements(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { start_time?: number; end_time?: number; page_size?: number; page_token?: string } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher, sort_field: "statement_time",
    page_size: String(params.page_size || 50),
  };
  if (params.start_time) query.statement_time_ge = String(params.start_time);
  if (params.end_time) query.statement_time_lt = String(params.end_time);
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi("/finance/202309/statements", accessToken, appKey, appSecret, { method: "GET", query });
}

export async function getPayments(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { create_time_ge?: number; create_time_lt?: number; page_size?: number; page_token?: string } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher, sort_field: "create_time",
    page_size: String(params.page_size || 50),
  };
  if (params.create_time_ge) query.create_time_ge = String(params.create_time_ge);
  if (params.create_time_lt) query.create_time_lt = String(params.create_time_lt);
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi("/finance/202309/payments", accessToken, appKey, appSecret, { method: "GET", query });
}

/**
 * 按结算单获取交易明细（返回该结算单内所有订单的交易）
 * GET /finance/202501/statements/{statement_id}/statement_transactions
 */
export async function getTransactionsByStatement(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  statementId: string,
  params: { page_size?: number; page_token?: string } = {}
) {
  const path = `/finance/202501/statements/${statementId}/statement_transactions`;
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    sort_field: "order_create_time",
    page_size: String(params.page_size || 50),
  };
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi(path, accessToken, appKey, appSecret, { method: "GET", query });
}

/**
 * 按订单获取结算交易明细（返回某订单的SKU级结算数据）
 * GET /finance/202501/orders/{order_id}/statement_transactions
 */
export async function getTransactionsByOrder(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  orderId: string
) {
  const path = `/finance/202501/orders/${orderId}/statement_transactions`;
  return await callTikTokApi(path, accessToken, appKey, appSecret, { method: "GET", query: { shop_cipher: shopCipher } });
}

/**
 * 获取未结算的交易
 * GET /finance/202507/orders/unsettled
 */
export async function getUnsettledTransactions(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { page_size?: number; page_token?: string } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    sort_field: "order_create_time",
    page_size: String(params.page_size || 50),
  };
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi("/finance/202507/orders/unsettled", accessToken, appKey, appSecret, { method: "GET", query });
}

// ==================== 商店分析 ====================

/**
 * 获取商店分析数据
 * GET /analytics/202509/shop/performance
 * 返回: GMV、订单数、客户数、访客数、转化率、退款等
 */
export async function getShopPerformance(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { start_date_ge: string; end_date_lt: string }
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    start_date_ge: params.start_date_ge,
    end_date_lt: params.end_date_lt,
  };
  return await callTikTokApi("/analytics/202509/shop/performance", accessToken, appKey, appSecret, { method: "GET", query });
}

/**
 * 获取店铺视频性能概览
 * GET /analytics/202509/shop_videos/overview_performance
 * 返回: 视频GMV、曝光量、点击量、点击率、SKU订单等
 */
export async function getShopVideoPerformance(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { start_date_ge: string; end_date_lt: string }
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    start_date_ge: params.start_date_ge,
    end_date_lt: params.end_date_lt,
  };
  return await callTikTokApi("/analytics/202509/shop_videos/overview_performance", accessToken, appKey, appSecret, { method: "GET", query });
}

/**
 * 获取店铺视频性能列表（每条视频的数据）
 * GET /analytics/202509/shop_videos/performance
 */
export async function getShopVideoList(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { start_date_ge: string; end_date_lt: string; page_size?: number; page_token?: string }
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    start_date_ge: params.start_date_ge,
    end_date_lt: params.end_date_lt,
  };
  if (params.page_size) query.page_size = String(params.page_size);
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi("/analytics/202509/shop_videos/performance", accessToken, appKey, appSecret, { method: "GET", query });
}

/**
 * 获取商店视频产品性能列表（某条视频里各商品的表现）
 * GET /analytics/202509/shop_videos/{video_id}/products/performance
 */
export async function getVideoProductPerformance(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  videoId: string,
  params: { start_date_ge: string; end_date_lt: string }
) {
  const path = `/analytics/202509/shop_videos/${videoId}/products/performance`;
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    start_date_ge: params.start_date_ge,
    end_date_lt: params.end_date_lt,
  };
  return await callTikTokApi(path, accessToken, appKey, appSecret, { method: "GET", query });
}

/**
 * 获取店铺视频性能详情（某条视频的详细数据含流量和观众画像）
 * GET /analytics/202509/shop_videos/{video_id}/performance
 */
export async function getVideoPerformanceDetail(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  videoId: string,
  params: { start_date_ge: string; end_date_lt: string }
) {
  const path = `/analytics/202509/shop_videos/${videoId}/performance`;
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    start_date_ge: params.start_date_ge,
    end_date_lt: params.end_date_lt,
  };
  return await callTikTokApi(path, accessToken, appKey, appSecret, { method: "GET", query });
}

// ==================== 联盟营销（达人消息）====================

const AFFILIATE_VER = "202412";

/** 获取对话列表 */
export async function getAffiliateConversations(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { page_size?: number; page_token?: string } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(params.page_size || 20),
  };
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi(`/affiliate_seller/${AFFILIATE_VER}/conversations`, accessToken, appKey, appSecret, { method: "GET", query });
}

/** 获取对话消息 */
export async function getAffiliateMessages(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  conversationId: string,
  params: { page_size?: number; page_token?: string } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(params.page_size || 20),
  };
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi(`/affiliate_seller/${AFFILIATE_VER}/conversation/${conversationId}/messages`, accessToken, appKey, appSecret, { method: "GET", query });
}

/** 获取最新未读消息 */
export async function getAffiliateNewestMessages(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { page_size?: number } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher,
    page_size: String(params.page_size || 20),
  };
  return await callTikTokApi(`/affiliate_seller/${AFFILIATE_VER}/conversations/messages/list/newest`, accessToken, appKey, appSecret, { method: "GET", query });
}

/** 发送即时消息 */
export async function sendAffiliateMessage(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  conversationId: string, content: string
) {
  const body = { content };
  return await callTikTokApi(`/affiliate_seller/${AFFILIATE_VER}/conversations/${conversationId}/messages`, accessToken, appKey, appSecret, { method: "POST", body });
}

// ==================== 产品相关 ====================

export async function searchProducts(
  accessToken: string, shopCipher: string, appKey: string, appSecret: string,
  params: { page_size?: number; page_token?: string } = {}
) {
  const query: Record<string, string> = {
    shop_cipher: shopCipher, page_size: String(params.page_size || 50),
  };
  if (params.page_token) query.page_token = params.page_token;
  return await callTikTokApi("/product/202309/products/search", accessToken, appKey, appSecret, {
    method: "POST", query, body: {},
  });
}

// ==================== 便捷方法：根据 shopId 自动获取 App 配置 ====================

/** 根据 shopId 获取对应的 App Key/Secret */
export async function getAppConfigByShopId(shopId: string) {
  const shop = await prisma.tikTokShopSetting.findUnique({ where: { shopId } });
  if (!shop?.appKey) {
    return { appKey: process.env.TIKTOK_APP_KEY || "", appSecret: process.env.TIKTOK_APP_SECRET || "" };
  }
  return await getAppConfig(shop.appKey);
}
