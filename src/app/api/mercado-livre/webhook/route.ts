import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Mercado Livre validates the notification URL with a lightweight GET/HEAD
// request before accepting it. Keep these probes side-effect free while the
// POST handler below continues to persist real notifications.
export function GET() {
  return NextResponse.json({ received: true });
}

export function HEAD() {
  return new NextResponse(null, { status: 200 });
}

function text(value: unknown) {
  const result = String(value || "").trim();
  return result || null;
}

function sentAt(value: unknown) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = text(body?.user_id);
    const topic = text(body?.topic);
    const resource = text(body?.resource);
    const applicationId = text(body?.application_id);
    const deliveryId = request.headers.get("x-request-id") || request.headers.get("x-delivery-id") || "";
    const eventKey = createHash("sha256").update(JSON.stringify({ deliveryId, userId, topic, resource, sent: body?.sent })).digest("hex");
    const account = userId ? await prisma.mercadoLivreAccount.findFirst({ where: { userId, status: "active" }, select: { id: true, appConfigId: true } }) : null;
    await prisma.mercadoLivreWebhookLog.upsert({
      where: { eventKey },
      create: {
        eventKey,
        accountId: account?.id || null,
        appConfigId: account?.appConfigId || null,
        applicationId,
        userId,
        topic,
        resource,
        attempts: Number.isFinite(Number(body?.attempts)) ? Number(body.attempts) : null,
        sentAt: sentAt(body?.sent),
        rawData: body as Prisma.InputJsonValue,
      },
      update: { attempts: Number.isFinite(Number(body?.attempts)) ? Number(body.attempts) : undefined, rawData: body as Prisma.InputJsonValue },
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Mercado Livre] webhook receipt failed", error);
    return NextResponse.json({ error: "Webhook 数据无效" }, { status: 400 });
  }
}
