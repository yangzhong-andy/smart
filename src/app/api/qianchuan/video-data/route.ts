import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isBusinessDate } from "@/lib/order-business-time";
import { getQianchuanVideoData } from "@/lib/qianchuan-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const videoId = String(body.videoId || "").trim();
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    if (!videoId) return NextResponse.json({ error: "videoId 不能为空" }, { status: 400 });
    if (!isBusinessDate(startDate) || !isBusinessDate(endDate) || startDate > endDate) {
      return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
    }
    const data = await getQianchuanVideoData({
      videoId,
      startDate,
      endDate,
      type: Number(body.type || 1),
      isVoucher: Number(body.isVoucher ?? 1),
    });
    return NextResponse.json({ data: data.data ?? data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取千川视频报表失败" }, { status: 502 });
  }
}
