import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { aiProviderStatus, decryptAiProviderConfig, saveServerAiProviderConfig, validateAiProviderConfig, verifyAiProviderConnection, AI_PROVIDER_COOKIE } from "@/lib/ai/provider-config";

export const dynamic = "force-dynamic";
const roles = ["SUPER_ADMIN", "ADMIN", "MANAGER"];
const adminRoles = ["SUPER_ADMIN", "ADMIN"];

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles });
  if (auth.response) return auth.response;
  try {
    const status = await aiProviderStatus(request);
    return NextResponse.json({ ...status, canManage: adminRoles.includes(auth.user.role) });
  } catch {
    return NextResponse.json({ error: "服务器 AI 授权读取失败，请联系管理员" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: adminRoles });
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  let config;
  try {
    config = body?.useBrowserConfig === true
      ? decryptAiProviderConfig(request.cookies.get(AI_PROVIDER_COOKIE)?.value)
      : validateAiProviderConfig({ endpoint: body?.endpoint, apiKey: body?.apiKey, model: body?.model });
    if (!config) throw new Error("当前浏览器没有可迁移的 AI 授权，请填写地址、模型和密钥");
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "授权配置无效" }, { status: 400 }); }
  try { await verifyAiProviderConnection(config); }
  // Do not use HTTP 502 here: the front proxy may replace upstream 5xx
  // responses with an empty gateway page, hiding the actionable reason.
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AI 连接测试失败", verified: false }, { status: 400 }); }
  try { await saveServerAiProviderConfig(config); }
  catch { return NextResponse.json({ error: "服务器保存 AI 授权失败，原有授权未改变" }, { status: 500 }); }
  const response = NextResponse.json({ ok: true, configured: true, source: "server", model: config.model, verified: true });
  response.cookies.set(AI_PROVIDER_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false, path: "/", maxAge: 0 });
  return response;
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request, { roles });
  if (auth.response) return auth.response;
  const response = NextResponse.json({ ok: true, configured: false });
  response.cookies.set(AI_PROVIDER_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false, path: "/", maxAge: 0 });
  return response;
}
