import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const KWAI_ORIGIN = "https://www.baxi8.com";
export const KWAI_CALLBACK = `${KWAI_ORIGIN}/api/kwai/oauth/callback`;
export const KWAI_SCOPES = "user_info,merchant_item,merchant_order";
const API = "https://api-shop.kwai.com";
export class KwaiError extends Error {}
export const hashKwai = (value: string) => createHash("sha256").update(value).digest("hex");

// Domain separated AES-GCM; no plaintext credentials or tokens in API responses/logs.
function key() {
  const secret = process.env.KWAI_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new KwaiError("服务器密钥配置不完整，请联系管理员");
  return createHash("sha256").update(`smart-erp:kwai:v1:${secret}`).digest();
}
export function sealKwai(value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((v) => v.toString("base64url")).join(".");
}
export function openKwai<T>(value: string): T {
  try {
    const parts = value.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))) throw new Error("invalid_cipher");
    const [iv, tag, data] = parts.map((v) => Buffer.from(v, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) throw new Error("invalid_cipher");
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
  } catch { throw new KwaiError("Kwai 加密配置无法读取，请联系管理员"); }
}
export function kwaiAuthorizeUrl(appKey: string, state: string) {
  const url = new URL("https://shop.kwai.com/shop/b/authorize");
  url.search = new URLSearchParams({ appKey, scope: KWAI_SCOPES, redirect_uri: KWAI_CALLBACK.replace(/^https:\/\//, ""), status: state }).toString();
  return url.toString();
}
export function kwaiSign(path: string, params: Record<string, string>, secret: string) {
  // Product docs explicitly exclude accessToken. Trade docs reference the generic
  // signing contract (all query parameters except sign). Sign decoded values.
  const product = path.startsWith("/rest/open/api/product/");
  const keys = Object.keys(params).filter((k) => k !== "sign" && !(product && k === "accessToken")).sort();
  return hashKwai(`api-shop.kwai.com${path}${keys.map((k) => `${k}=${params[k]}`).join("")}signSecret=${secret}`);
}
export function parseKwaiJson(text: string): any {
  // Preserve Long IDs without rounding, including nested arrays; never rewrite string literals.
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (part) => {
    if (/^-?\d+$/.test(part) && !Number.isSafeInteger(Number(part))) return JSON.stringify(part);
    return part;
  }));
}
export function kwaiId(value: unknown) {
  if ((typeof value !== "string" && typeof value !== "number") || (typeof value === "number" && !Number.isSafeInteger(value)) || !/^\d{1,20}$/.test(String(value))) throw new KwaiError("Kwai 返回的业务编号格式异常");
  return String(value);
}
export type KwaiCredentials = { appSecret: string; signSecret: string };
export type KwaiToken = { merchantId: string; shopName: string; accessToken: string; refreshToken: string; expiresIn: number; refreshTokenExpiresIn: number; scopes: string };
export function parseKwaiToken(data: any, previous?: Pick<KwaiToken, "merchantId" | "shopName">): KwaiToken {
  if (!data || typeof data.accessToken !== "string" || !data.accessToken || typeof data.refreshToken !== "string" || !data.refreshToken ||
    !Number.isSafeInteger(data.expiresIn) || data.expiresIn <= 0 || data.expiresIn > 366 * 86400 ||
    !Number.isSafeInteger(data.refreshTokenExpiresIn) || data.refreshTokenExpiresIn <= 0 || data.refreshTokenExpiresIn > 3 * 366 * 86400 || typeof data.scopes !== "string") {
    throw new KwaiError("Kwai 令牌响应不完整，请联系平台核实");
  }
  const merchantId = kwaiId(data.merchantId ?? previous?.merchantId);
  if (previous && merchantId !== previous.merchantId) throw new KwaiError("刷新令牌的店铺身份不匹配");
  return { merchantId, shopName: typeof data.shopName === "string" && data.shopName ? data.shopName.slice(0,200) : previous?.shopName || `Kwai-${merchantId}`,
    accessToken: data.accessToken, refreshToken: data.refreshToken, expiresIn: data.expiresIn, refreshTokenExpiresIn: data.refreshTokenExpiresIn, scopes: data.scopes };
}
async function request(path: string, query: Record<string, string>, body?: string) {
  const url = new URL(path, API);
  url.search = new URLSearchParams(query).toString();
  let response: Response;
  try {
    response = await fetch(url, { method: body === undefined ? "GET" : "POST", body, headers: { "Content-Type": "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
  } catch { throw new KwaiError("Kwai 网络请求失败或超时，请稍后重试"); }
  if (!response.ok) throw new KwaiError(`Kwai 接口请求失败（HTTP ${response.status}）`);
  let json: any;
  try { json = parseKwaiJson(await response.text()); } catch { throw new KwaiError("Kwai 返回了非预期的数据格式"); }
  if (json?.result !== 200) {
    // Do not surface upstream messages which might echo request tokens/URLs.
    const code = Number.isSafeInteger(json?.result) ? json.result : "未知";
    throw new KwaiError(`Kwai 接口拒绝请求（代码 ${code}），请核对授权及签名配置`);
  }
  return json.data;
}
export async function kwaiExchange(appKey: string, secret: string, code: string) {
  return parseKwaiToken(await request("/rest/open/api/oauth2/token", { appKey, appSecret: secret, grant_type: "authorization_code", code }));
}
export async function kwaiRefresh(appKey: string, secret: string, token: KwaiToken) {
  return parseKwaiToken(await request("/rest/open/api/oauth2/refreshToken", { appKey, appSecret: secret, grant_type: "refresh_token", refresh_token: token.refreshToken }), token);
}
const READ_PATHS = new Set(["/rest/open/api/trade/queryOrderList", "/rest/open/api/trade/queryOrderDetails", "/rest/open/api/product/listItem", "/rest/open/api/product/getSkuList"]);
export async function kwaiRead(appKey: string, signSecret: string, token: KwaiToken, path: string, body?: string, extra: Record<string,string> = {}) {
  if (!READ_PATHS.has(path)) throw new KwaiError("当前接入仅允许查询接口");
  const query = { ...extra, appKey, merchantId: token.merchantId, ts: String(Date.now()), version: "1.0", accessToken: token.accessToken };
  return request(path, { ...query, sign: kwaiSign(path, query, signSecret) }, body);
}
