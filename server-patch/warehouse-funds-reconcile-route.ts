import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { reconcileWarehouseFees, reverseWarehouseFeeForOrder } from "@/lib/warehouse-fund-reconciliation";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

/**
 * Reconciles warehouse fulfillment debits from the same profit calculation
 * shown in the UI. It is intentionally an explicit POST so merely viewing a
 * report never changes balances.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const today = new Date().toISOString().slice(0, 10);
    const startDate = String(body?.startDate || body?.date || today).slice(0, 10);
    const endDate = String(body?.endDate || body?.date || startDate).slice(0, 10);
    const shopId = String(body?.shopId || "").trim();
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
      const params = new URLSearchParams({ startDate: date, endDate: date, groupBy: "day", includeOrders: "1", autoWarehouseDebit: "0" });
      if (shopId) params.set("shopId", shopId);
      const reportResponse = await fetch(`${origin}/api/profit-report?${params.toString()}`, {
        headers: cookie ? { cookie } : undefined,
        cache: "no-store",
      });
      const report = await reportResponse.json();
      if (!reportResponse.ok) throw new Error(report?.error || `${date} 利润报告读取失败`);
      const orders = Array.isArray(report?.orders) ? report.orders : [];
      summary.orders += orders.length;
      // Free samples are excluded from store profit but must still be charged
      // to the warehouse ledger for their pick, pack, and fulfillment work.
      const activeRows = orders.filter((row: any) => row.status !== "CANCELLED" && row.status !== "UNPAID");
      const sampleRows = activeRows.filter((row: any) => row.isSampleOrder === true);
      const result = await reconcileWarehouseFees(activeRows);
      summary.deducted += result.deducted;
      summary.sampleOrders += sampleRows.length;
      const deductedSampleIds = new Set(result.results.filter((row) => row.status === "deducted").map((row) => row.orderId));
      summary.sampleDeducted += sampleRows.filter((row: any) => deductedSampleIds.has(row.orderId)).length;
      summary.duplicate += result.duplicate;
      summary.skipped += result.skipped;
      summary.errors += result.errors;
      const cancelled = orders.filter((row: any) => row.status === "CANCELLED");
      for (const row of cancelled) {
        const reversal: any = await reverseWarehouseFeeForOrder(row.orderId);
        if (!reversal.skipped) summary.reversed += 1;
      }
      summary.details.push({ date, orders: orders.length, sampleOrders: sampleRows.length, sampleDeducted: sampleRows.filter((row: any) => deductedSampleIds.has(row.orderId)).length, deducted: result.deducted, duplicate: result.duplicate, skipped: result.skipped, errors: result.errors, cancelled: cancelled.length });
    }
    return NextResponse.json({ success: true, ...summary });
  } catch (error: any) {
    console.error("[Warehouse fund reconcile]", error);
    return NextResponse.json({ error: error?.message || "仓库扣费补记失败" }, { status: 500 });
  }
}
