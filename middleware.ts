import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { AUTH_SECRET } from "@/lib/auth-secret";

/**
 * 黑名单：路径包含以下任意字符串时直接返回 404
 * 用于拦截 WordPress 扫描、恶意探测等请求
 */
const BLACKLIST_PATTERNS = ["wp-admin", ".php", "wordpress", "setup-config"];

function isBlacklisted(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLACKLIST_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function isValidCustomToken(token: string): Promise<boolean> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) return false;
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedHeader)));
    if (header.alg !== "HS256") return false;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload)));
    const userId = payload.userId || payload.id;
    if (typeof userId !== "string" || (payload.exp && Number(payload.exp) <= Date.now() / 1000)) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return false;
  }
}

const PUBLIC_API_PATHS = [
  "/api/auth/",
  "/api/tiktok/callback",
  "/api/tiktok/webhook",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 黑名单过滤：优先检查，直接返回 404，不执行后续逻辑
  if (isBlacklisted(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (pathname.startsWith("/api/") && !PUBLIC_API_PATHS.some((path) => pathname === path || pathname.startsWith(path))) {
    if (request.method === "OPTIONS") return NextResponse.next();

    const customToken = request.cookies.get("token")?.value ||
      (request.headers.get("authorization")?.startsWith("Bearer ")
        ? request.headers.get("authorization")!.slice(7).trim()
        : null);
    if (customToken && await isValidCustomToken(customToken)) return NextResponse.next();

    const nextAuthToken = await getToken({ req: request, secret: AUTH_SECRET });
    if (nextAuthToken?.id || nextAuthToken?.sub) return NextResponse.next();

    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 排除以下路径，确保中间件绝对不会被触发：
     * - _next/* : Next.js 内部（static、image、data、webpack 等）
     * - 常见静态资源扩展名：js、css、图片、字体等
     * - favicon.ico、sitemap.xml、robots.txt
     */
    "/((?!_next|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:js|css|ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|eot|otf|map|json|txt|xml|webmanifest)$).*)",
  ],
};
