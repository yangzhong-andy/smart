import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  reconcileMercadoLivreWarehouseFeesForDate,
  reconcileShopeeWarehouseFeesForDate,
  reconcileWarehouseFees,
  reverseWarehouseFeeForOrder,
} from "@/lib/warehouse-fund-reconciliation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

async function canReconcile(request: NextRequest) {
  const internalToken = request.headers.get("x-shopee-sync-token")
    || request.headers.get("x-monthly-bill-sync-token")
    || request.headers.get("x-warehouse-reconcile-token");
  if (internalToken && process.env.NEXTAUTH_SECRET && internalToken === process.env.NEXTAUTH_SECRET) return true;
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  return !auth.response;
}

/**
 * Reconciles warehouse fulfillment debits from the same profit calculation
 * shown in the UI. It is intentionally an explicit POST so merely viewing a
 * report never changes balances.
 */
export async function POST(request: NextRequest) {
  if (!(await canReconcile(request))) {
    return NextResponse.json({ error: "没有权限执行仓库扣费补记" }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const today = new Date().toISOString().slice(0, 10);
    const startDate = String(body?.startDate || body?.date || today).slice(0, 10);
    const endDate = String(body?.endDate || body?.date || startDate).slice(0, 10);
    const shopId = String(body?.shopId || "").trim();
    const platform = String(body?.platform || "TIKTOK").trim().toUpperCase();
    if (!new Set(["ALL", "TIKTOK", "SHOPEE", "MERCADO_LIVRE"]).has(platform)) {
      return NextResponse.json({ error: "仅支持 TikTok Shop、Shopee 或 Mercado Livre 仓库扣费补记" }, { status: 400 });
    }
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
    }
    const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
    if (days > 31) return NextResponse.json({ error: "单次最多补记 31 天，避免长时间占用同步任务" }, { status: 400 });

    const origin = new URL(request.url).origin;
    const cookie = request.headers.get("cookie") || "";
    const summary = { days, orders: 0, sampleOrders: 0, sampleDeducted: 0, deducted: 0, duplicate: 0, reversed: 0, skipped: 0, errors: 0, details: [] as any[] };
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
      if (platform === "ALL" || platform === "TIKTOK") {
        const params = new URLSearchParams({ startDate: date, endDate: date, groupBy: "day", includeOrders: "1", autoWarehouseDebit: "0" });
        if (shopId) params.set("shopId", shopId);
        const reportResponse = await fetch(`${origin}/api/profit-report?${params.toString()}`, {
          headers: cookie ? { cookie } : undefined,
          cache: "no-store",
        });
        const report = await reportResponse.json();
        if (!reportResponse.ok) throw new Error(report?.error || `${date} TikTok 利润报告读取失败`);
        const orders = Array.isArray(report?.orders) ? report.orders : [];
        summary.orders += orders.length;
        // Free samples are excluded from store profit, but they still consume
        // warehouse fulfillment and must be charged to the warehouse ledger.
        const activeRows = orders.filter((row: any) => row.status !== "CANCELLED" && row.status !== "UNPAID");
        const sampleRows = activeRows.filter((row: any) => row.isSampleOrder === true);
        const result = await reconcileWarehouseFees(activeRows.map((row: any) => ({ ...row, platform: "TIKTOK" })));
        summary.deducted += result.deducted;
        summary.sampleOrders += sampleRows.length;
        const deductedSampleIds = new Set(result.results.filter((row) => row.status === "deducted").map((row) => row.orderId));
        summary.sampleDeducted += sampleRows.filter((row: any) => deductedSampleIds.has(row.orderId)).length;
        summary.duplicate += result.duplicate;
        summary.skipped += result.skipped;
        summary.errors += result.errors;
        const cancelled = orders.filter((row: any) => row.status === "CANCELLED");
        for (const row of cancelled) {
          const reversal: any = await reverseWarehouseFeeForOrder(row.orderId, "TIKTOK");
          if (!reversal.skipped) summary.reversed += 1;
        }
        summary.details.push({ date, platform: "TIKTOK", orders: orders.length, sampleOrders: sampleRows.length, deducted: result.deducted, sampleDeducted: sampleRows.filter((row: any) => deductedSampleIds.has(row.orderId)).length, duplicate: result.duplicate, skipped: result.skipped, errors: result.errors, cancelled: cancelled.length });
      }
      if (platform === "ALL" || platform === "SHOPEE") {
        const result = await reconcileShopeeWarehouseFeesForDate(origin, date, shopId);
        summary.orders += result.orders;
        summary.deducted += result.deducted;
        summary.duplicate += result.duplicate;
        summary.reversed += result.reversed;
        summary.skipped += result.skipped;
        summary.errors += result.errors;
        summary.details.push({ date, platform: "SHOPEE", ...result });
      }
      if (platform === "ALL" || platform === "MERCADO_LIVRE") {
        const result = await reconcileMercadoLivreWarehouseFeesForDate(origin, date, shopId || null);
        summary.orders += result.orders;
        summary.deducted += result.deducted;
        summary.duplicate += result.duplicate;
        summary.reversed += result.reversed;
        summary.skipped += result.skipped;
        summary.errors += result.errors;
        summary.details.push({ date, platform: "MERCADO_LIVRE", ...result });
      }
    }
    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    console.error("[Warehouse fund reconcile]", error);
    return NextResponse.json({ error: error?.message || "仓库扣费补记失败" }, { status: 500 });
  }
}
