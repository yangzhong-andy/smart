import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  const apps = await prisma.shopeeAppConfig.findMany({
    where: { status: "active" }, orderBy: { createdAt: "asc" },
    select: { id: true, appName: true, partnerId: true, environment: true, testRedirectDomain: true, liveRedirectDomain: true, status: true, createdAt: true, _count: { select: { shops: true } } },
  });
  return NextResponse.json({ apps: apps.map(({ _count, ...app }) => ({ ...app, shopCount: _count.shops })) });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const appName = String(body.appName || "").trim();
    const partnerId = String(body.partnerId || "").trim();
    const partnerKey = String(body.partnerKey || "").trim();
    const environment = body.environment === "live" ? "live" : "sandbox";
    if (!appName || !partnerId || !partnerKey) return NextResponse.json({ error: "应用名称、Partner ID、Partner Key 均不能为空" }, { status: 400 });
    const app = await prisma.shopeeAppConfig.create({ data: { appName, partnerId, partnerKey, environment, testRedirectDomain: body.testRedirectDomain || null, liveRedirectDomain: body.liveRedirectDomain || null } });
    return NextResponse.json({ success: true, id: app.id });
  } catch (error: any) {
    if (error?.code === "P2002") return NextResponse.json({ error: "该 Partner ID 和环境已存在" }, { status: 409 });
    return NextResponse.json({ error: error?.message || "保存应用失败" }, { status: 500 });
  }
}
