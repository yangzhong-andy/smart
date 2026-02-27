import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { getToken } from "next-auth/jwt";

const JWT_SECRET =
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径不验证
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/public") ||
    pathname.includes("favicon")
  ) {
    return NextResponse.next();
  }

  // 1）优先验证自定义 JWT cookie（如果你以后在前端设置了 token cookie）
  const cookieToken = request.cookies.get("token")?.value;
  if (cookieToken) {
    try {
      jwt.verify(cookieToken, JWT_SECRET);
      return NextResponse.next();
    } catch {
      // 无效则继续尝试使用 NextAuth 的会话
    }
  }

  // 2）兜底：使用 NextAuth 的 JWT 会话（当前登录页就是用的 NextAuth）
  const nextAuthToken = await getToken({
    req: request as any,
    secret: process.env.NEXTAUTH_SECRET || JWT_SECRET,
  });

  if (nextAuthToken) {
    return NextResponse.next();
  }

  // 都没有，则认为未登录
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
