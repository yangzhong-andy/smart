import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 黑名单：路径包含以下任意字符串时直接返回 404
 * 用于拦截 WordPress 扫描、恶意探测等请求
 */
const BLACKLIST_PATTERNS = ["wp-admin", ".php", "wordpress", "setup-config"];

function isBlacklisted(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return BLACKLIST_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 黑名单过滤：优先检查，直接返回 404，不执行后续逻辑
  if (isBlacklisted(pathname)) {
    return new NextResponse(null, { status: 404 });
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
