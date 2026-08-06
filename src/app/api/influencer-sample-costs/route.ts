import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

function nonNegative(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim();
    const influencerId = String(body?.influencerId || "").trim() || null;
    const manualShippingCost = nonNegative(body?.manualShippingCost);
    const otherCost = nonNegative(body?.otherCost);
    if (!orderId || manualShippingCost == null || otherCost == null) {
      return NextResponse.json({ error: "寄样成本参数无效" }, { status: 400 });
    }
    const order = await prisma.tikTokOrder.findUnique({
      where: { orderId },
      select: { shopId: true, rawData: true },
    });
    if (!order || !(order.rawData as any)?.is_sample_order) {
      return NextResponse.json({ error: "免费样品订单不存在" }, { status: 400 });
    }
    if (influencerId) {
      const influencer = await prisma.influencer.findUnique({ where: { id: influencerId }, select: { id: true } });
      if (!influencer) return NextResponse.json({ error: "达人不存在" }, { status: 400 });
    }
    const row = await prisma.influencerSampleCost.upsert({
      where: { orderId },
      create: {
        orderId,
        shopId: order.shopId,
        influencerId,
        teamName: String(body?.teamName || "").trim() || null,
        manualShippingCost,
        otherCost,
        currency: String(body?.currency || "BRL").trim().toUpperCase(),
        notes: String(body?.notes || "").trim() || null,
      },
      update: {
        influencerId,
        teamName: String(body?.teamName || "").trim() || null,
        manualShippingCost,
        otherCost,
        currency: String(body?.currency || "BRL").trim().toUpperCase(),
        notes: String(body?.notes || "").trim() || null,
      },
    });
    return NextResponse.json({ success: true, id: row.id });
  } catch (error: any) {
    console.error("[Influencer Sample Cost]", error);
    return NextResponse.json({ error: error?.message || "寄样成本保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const orderId = request.nextUrl.searchParams.get("orderId") || "";
    if (!orderId) return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
    await prisma.influencerSampleCost.deleteMany({ where: { orderId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Influencer Sample Cost]", error);
    return NextResponse.json({ error: error?.message || "寄样成本删除失败" }, { status: 500 });
  }
}
