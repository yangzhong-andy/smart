import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Historical rebuild is intentionally disabled. It used to delete all order
 * deductions and stock logs before recalculating with legacy one-to-one SKU
 * mappings, which is unsafe after warehouse switching and bundle BOM support.
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN"] });
  if (auth.response) return auth.response;

  return NextResponse.json(
    {
      error: "历史库存批量重算已停用。请先完成海外仓期初盘点，再使用支持仓库切换与组合 SKU 的新扣减任务。",
      code: "HISTORICAL_STOCK_REBUILD_DISABLED",
    },
    { status: 410 },
  );
}
