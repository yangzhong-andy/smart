import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Historical stock rebuild is intentionally read-only for now. Warehouse
 * switches, bundle BOMs, initial stock and previous deductions must be
 * reconciled before any destructive rebuild is allowed.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => ({}));
  const orders = await prisma.tikTokOrder.findMany({
    where: { status: { in: ["DELIVERED", "COMPLETED", "IN_TRANSIT", "AWAITING_COLLECTION"] } },
    select: { orderId: true, shopId: true, status: true, createTime: true },
    orderBy: { createTime: "asc" },
  });

  if (body?.confirm !== true) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      message: "仅预览，历史库存未修改。请核对报告后再提交 confirm=true。",
      summary: { eligibleOrders: orders.length },
      orders: orders.slice(0, 500),
    });
  }

  return NextResponse.json({
    error: "历史库存重算尚未开放执行。请先完成仓库归属核对报告和期初库存确认。",
    code: "HISTORICAL_STOCK_REBUILD_REQUIRES_CALIBRATION",
  }, { status: 409 });
}
