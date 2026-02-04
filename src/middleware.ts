import { NextRequest, NextResponse } from "next/server";

/**
 * 鉴权改由 LayoutWrapper 处理：middleware 里用 getToken 在登录刚完成时
 * 可能拿不到刚写入的 cookie（Edge/时序），会导致登入成功仍被重定向回登录页，
 * 故此处不再做登录校验，未登录时由 layout-wrapper 显示「正在跳转到登录页」并 replace 到 /login。
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
