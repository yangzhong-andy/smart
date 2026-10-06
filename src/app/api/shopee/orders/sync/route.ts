import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { syncIncrementalShopeeOrders, syncShopeeOrders } from "@/lib/shopee-order-sync";
import { reconcileRecentShopeeWarehouseFees } from "@/lib/warehouse-fund-reconciliation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function canSync(request: NextRequest) {
  const internalToken = request.headers.get("x-shopee-sync-token") || request.headers.get("x-monthly-bill-sync-token");
  if (internalToken && process.env.NEXTAUTH_SECRET && internalToken === process.env.NEXTAUTH_SECRET) {
    return true;
  }
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

function epoch(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

export async function POST(request: NextRequest) {
  if (!(await canSync(request))) {
    return NextResponse.json({ error: "没有权限同步 Shopee 订单" }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    if (body.incremental === true) {
      const result = await syncIncrementalShopeeOrders({ shopId: body.shopId ? String(body.shopId) : undefined });
      // Webhooks are not guaranteed to arrive. Reconcile the recent rolling
      // window after every scheduled order sync as an idempotent fallback.
      const warehouseReconciliation = await reconcileRecentShopeeWarehouseFees(
        new URL(request.url).origin,
        { shopId: body.shopId ? String(body.shopId) : undefined, days: 7 },
      );
      return NextResponse.json(
        {
          success: result.errors.length === 0 && warehouseReconciliation.errors === 0,
          ...(result.errors.length ? { error: "部分 Shopee 店铺增量同步失败" } : {}),
          ...(warehouseReconciliation.errors ? { warehouseError: "部分 Shopee 海外仓扣费对账失败" } : {}),
          ...result,
          warehouseReconciliation,
        },
        { status: result.errors.length || warehouseReconciliation.errors ? 502 : 200 },
      );
    }
    const now = Math.floor(Date.now() / 1000);
    const days = Math.min(730, Math.max(1, Math.trunc(Number(body.days) || 30)));
    const timeFrom = epoch(body.startDate) ?? now - days * 24 * 60 * 60;
    const timeTo = epoch(body.endDate) ?? now;
    if (timeFrom > timeTo) {
      return NextResponse.json({ error: "开始时间不能晚于结束时间" }, { status: 400 });
    }
    if (timeTo - timeFrom > 730 * 24 * 60 * 60) {
      return NextResponse.json({ error: "单次同步范围不能超过 730 天" }, { status: 400 });
    }
    const result = await syncShopeeOrders({
      shopId: body.shopId ? String(body.shopId) : undefined,
      timeFrom,
      timeTo,
    });
    const warehouseReconciliation = await reconcileRecentShopeeWarehouseFees(
      new URL(request.url).origin,
      { shopId: body.shopId ? String(body.shopId) : undefined, days: 7 },
    );
    return NextResponse.json(
      {
        success: result.errors.length === 0 && warehouseReconciliation.errors === 0,
        ...(result.errors.length ? { error: "部分 Shopee 店铺订单同步失败" } : {}),
        ...(warehouseReconciliation.errors ? { warehouseError: "部分 Shopee 海外仓扣费对账失败" } : {}),
        ...result,
        warehouseReconciliation,
      },
      { status: result.errors.length || warehouseReconciliation.errors ? 502 : 200 },
    );
  } catch (error) {
    console.error("[Shopee Orders] sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Shopee 订单同步失败" },
      { status: 500 },
    );
  }
}
