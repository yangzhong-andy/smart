import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { syncMercadoLivreOrders } from "@/lib/mercado-livre-order-sync";
import { reconcileRecentMercadoLivreWarehouseFees } from "@/lib/warehouse-fund-reconciliation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function canSync(request: NextRequest) {
  const token = request.headers.get("x-platform-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (token && process.env.NEXTAUTH_SECRET && token === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

export async function POST(request: NextRequest) {
  if (!(await canSync(request))) return NextResponse.json({ error: "没有权限同步 Mercado Livre 订单" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncMercadoLivreOrders({
      accountId: body.accountId ? String(body.accountId) : undefined,
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      days: body.days ? Number(body.days) : undefined,
    });
    // Keep the ledger durable even when a platform webhook is delayed or
    // dropped. Re-running this rolling window is idempotent by source key.
    const selectedAccount = body.accountId
      ? await prisma.mercadoLivreAccount.findUnique({ where: { id: String(body.accountId) }, select: { userId: true } })
      : null;
    const warehouseReconciliation = await reconcileRecentMercadoLivreWarehouseFees(
      new URL(request.url).origin,
      { shopId: selectedAccount?.userId || (body.shopId ? String(body.shopId) : undefined), days: 7 },
    );
    return NextResponse.json(
      {
        success: result.errors.length === 0 && warehouseReconciliation.errors === 0,
        ...(result.errors.length ? { error: "部分 Mercado Livre 账号同步失败" } : {}),
        ...(warehouseReconciliation.errors ? { warehouseError: "部分 Mercado Livre 海外仓扣费对账失败" } : {}),
        ...result,
        warehouseReconciliation,
      },
      { status: result.errors.length || warehouseReconciliation.errors ? 502 : 200 },
    );
  } catch (error) {
    console.error("[Mercado Livre Orders] sync failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mercado Livre 订单同步失败" }, { status: 500 });
  }
}
