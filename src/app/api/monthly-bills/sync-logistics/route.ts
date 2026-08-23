import { NextResponse } from "next/server";
import { syncLogisticsMonthlyBills } from "@/lib/monthly-bill-sync";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await syncLogisticsMonthlyBills();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "物流月账单生成失败" },
      { status: 500 }
    );
  }
}
