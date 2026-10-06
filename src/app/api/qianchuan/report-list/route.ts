import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { getQianchuanReportList } from "@/lib/qianchuan-api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const page = Math.max(1, Math.trunc(Number(body.page) || 1));
    const limit = Math.min(200, Math.max(1, Math.trunc(Number(body.limit) || 20)));
    const data = await getQianchuanReportList({
      date: String(body.date || "7days"),
      type: Number(body.type || 1),
      dataType: Number(body.dataType || 1),
      page,
      limit,
      idsStr: String(body.idsStr || ""),
      typeIdStr: String(body.typeIdStr || ""),
      orderType: Number(body.orderType || 1),
      video_name_id: String(body.videoNameId ?? body.video_name_id ?? ""),
      is_hot: Number(body.isHot ?? body.is_hot ?? 0),
      cate_id: Number(body.categoryId ?? body.cate_id ?? 0),
    });
    return NextResponse.json({ data: data.data ?? data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取千川投放报表列表失败" }, { status: 502 });
  }
}
