import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getAuthSecret } from "@/lib/auth-secret";
import { AUTH_COOKIE_NAMES } from "@/lib/auth-cookies";

const BLACKLIST_PATTERNS = ["wp-admin", ".php", "wordpress", "setup-config"];

const PUBLIC_API_PREFIXES = [
  "/api/auth/callback/",
  "/api/auth/signin/",
  "/api/auth/signout/",
];
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/simple-login",
  "/api/auth/session",
  "/api/auth/csrf",
  "/api/auth/providers",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/error",
  "/api/tiktok/callback",
  "/api/kwai/oauth/callback",
  "/api/tiktok/webhook",
  "/api/shopee/oauth/callback",
  "/api/mercado-livre/oauth/callback",
  "/api/mercadolivre/oauth/callback",
  "/api/mercadolivre/webhook",
  "/api/mercado-livre/webhook",
  "/api/mercado-livre/finance/sync",
  "/api/marketplace/notifications",
  "/api/shopee/webhook",
]);

function isBlacklisted(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLACKLIST_PATTERNS.some((pattern) => lower.includes(pattern));
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
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
    if (typeof userId !== "string") return false;
    if (payload.exp && Number(payload.exp) <= Date.now() / 1000) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getAuthSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    return false;
  }
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const bearer = request.headers.get("authorization");
  const customToken =
    request.cookies.get(AUTH_COOKIE_NAMES.customToken)?.value ||
    (bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null);

  if (customToken && await isValidCustomToken(customToken)) return true;

  const nextAuthToken = await getToken({
    req: request,
    secret: getAuthSecret(),
    cookieName: AUTH_COOKIE_NAMES.sessionToken,
  });
  return Boolean(nextAuthToken?.id || nextAuthToken?.sub);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isBlacklisted(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (pathname === "/login") return NextResponse.next();

  const isPublicApi =
    PUBLIC_API_PATHS.has(pathname) ||
    PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isPublicApi) return NextResponse.next();

  if (pathname.startsWith("/api/") && request.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (await hasValidSession(request)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登录或登录已过期" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:js|css|ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|eot|otf|map|json|txt|xml|webmanifest)$).*)",
  ],
};
