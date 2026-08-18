import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOverseasStockAudit } from "@/lib/overseas-stock-audit";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await buildOverseasStockAudit(prisma);
    return NextResponse.json(report, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error: any) {
    console.error("[Overseas Stock Audit]", error);
    return NextResponse.json({ error: error?.message || "海外仓库存审计失败" }, { status: 500 });
  }
}
