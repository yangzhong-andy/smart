import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isBusinessDate } from "@/lib/order-business-time";
import { getQianchuanAdvertVideoReport } from "@/lib/qianchuan-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const params = request.nextUrl.searchParams;
    const videoId = params.get("videoId")?.trim() || "";
    const advertAccountId = params.get("advertAccountId")?.trim() || "";
    const startDate = params.get("startDate") || "";
    const endDate = params.get("endDate") || "";
    if (!videoId || !advertAccountId) return NextResponse.json({ error: "videoId 和 advertAccountId 不能为空" }, { status: 400 });
    if (!isBusinessDate(startDate) || !isBusinessDate(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
    }
    const data = await getQianchuanAdvertVideoReport({
      videoId,
      advertAccountId,
      startDate,
      endDate,
      type: Number(params.get("type") || 1),
      isVoucher: Number(params.get("isVoucher") || 1),
    });
    return NextResponse.json({ data: data.data ?? data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取千川素材投放数据失败" }, { status: 502 });
  }
}
