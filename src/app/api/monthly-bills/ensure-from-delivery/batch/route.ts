import { NextResponse } from "next/server";
import { syncSupplierMonthlyBills } from "@/lib/monthly-bill-sync";

export const dynamic = "force-dynamic";

/** Recalculate all supplier bills from delivery orders. */
export async function POST() {
  try {
    const result = await syncSupplierMonthlyBills();
    return NextResponse.json({
      success: true,
      message: `供应商月账单已重算：新建 ${result.created} 条，更新 ${result.updated} 条，清空 ${result.cleared} 条，锁定跳过 ${result.skippedLocked} 条`,
      ...result,
      totalGroups: result.groups,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "批量生成月账单失败" },
      { status: 500 }
    );
  }
}
