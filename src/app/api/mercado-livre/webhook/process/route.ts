import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncMercadoLivreOrderById } from "@/lib/mercado-livre-order-sync";
import {
  reconcileMercadoLivreWarehouseFeesForDate,
  warehouseBusinessDate,
} from "@/lib/warehouse-fund-reconciliation";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function orderIdFromResource(resource: string | null) {
  const match = String(resource || "").match(/\/orders\/(\d+)/i);
  return match?.[1] || null;
}

async function allowed(request: NextRequest) {
  const token = request.headers.get("x-platform-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await allowed(request))) return NextResponse.json({ error: "没有权限处理 Mercado Livre Webhook" }, { status: 403 });
  const logs = await prisma.mercadoLivreWebhookLog.findMany({
    where: { status: { in: ["received", "failed"] } },
    orderBy: { receivedAt: "asc" },
    take: 50,
  });
  const results: Array<{ id: string; status: string; error?: string }> = [];
  for (const log of logs) {
    try {
      await prisma.mercadoLivreWebhookLog.update({ where: { id: log.id }, data: { status: "processing", processAttempts: { increment: 1 }, lastError: null } });
      const orderId = orderIdFromResource(log.resource);
      if (!orderId || !log.accountId || !String(log.topic || "").toLowerCase().includes("orders")) {
        await prisma.mercadoLivreWebhookLog.update({ where: { id: log.id }, data: { status: "ignored", processedAt: new Date() } });
        results.push({ id: log.id, status: "ignored" });
        continue;
      }
      await syncMercadoLivreOrderById({ accountId: log.accountId, orderId });
      const syncedOrder = await prisma.mercadoLivreOrder.findUnique({
        where: { accountId_externalOrderId: { accountId: log.accountId, externalOrderId: orderId } },
        select: { dateCreated: true, account: { select: { userId: true, country: true } } },
      });
      if (syncedOrder?.dateCreated) {
        const businessDate = warehouseBusinessDate(syncedOrder.dateCreated, syncedOrder.account.country);
        await reconcileMercadoLivreWarehouseFeesForDate(
          new URL(request.url).origin,
          businessDate,
          syncedOrder.account.userId,
        );
      }
      await prisma.mercadoLivreWebhookLog.update({ where: { id: log.id }, data: { status: "processed", processedAt: new Date(), lastError: null } });
      results.push({ id: log.id, status: "processed" });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      await prisma.mercadoLivreWebhookLog.update({ where: { id: log.id }, data: { status: "failed", lastError: message } });
      results.push({ id: log.id, status: "failed", error: message });
    }
  }
  return NextResponse.json({ success: results.every((result) => result.status !== "failed"), processed: results.length, results });
}
