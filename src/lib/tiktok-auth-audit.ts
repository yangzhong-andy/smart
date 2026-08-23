import { prisma } from "@/lib/prisma";

export async function recordTikTokAuthEvent(input: {
  eventType: string;
  status: "SUCCESS" | "FAILED" | "INFO";
  appKey?: string | null;
  shopId?: string | null;
  userId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.tikTokAuthEvent.create({
      data: {
        eventType: input.eventType,
        status: input.status,
        appKey: input.appKey || null,
        shopId: input.shopId || null,
        userId: input.userId || null,
        message: input.message || null,
        metadata: input.metadata as any,
      },
    });
  } catch (error) {
    // Auditing must never interrupt authorization or data synchronization.
    console.error("[TikTok Auth Audit] failed:", error);
  }
}
