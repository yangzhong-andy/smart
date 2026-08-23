import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** Read-only authorization audit history. Secrets and token values are never stored here. */
export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit") || 20);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 20));
    const appKey = searchParams.get("appKey")?.trim() || undefined;
    const shopId = searchParams.get("shopId")?.trim() || undefined;
    const events = await prisma.tikTokAuthEvent.findMany({
      where: { ...(appKey ? { appKey } : {}), ...(shopId ? { shopId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, eventType: true, status: true, appKey: true, shopId: true, message: true, metadata: true, createdAt: true },
    });
    return NextResponse.json({ events });
  } catch (error: any) {
    console.error("[TikTok Auth Events] error:", error);
    return NextResponse.json({ error: error?.message || "授权历史加载失败" }, { status: 500 });
  }
}
