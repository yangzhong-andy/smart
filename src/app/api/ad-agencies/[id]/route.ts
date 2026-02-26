import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const platformMap: Record<string, "FB" | "Google" | "TikTok" | "OTHER"> = {
  FB: "FB",
  Google: "Google",
  TikTok: "TikTok",
  "其他": "OTHER",
  OTHER: "OTHER",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agency = await prisma.adAgency.findUnique({
      where: { id: params.id },
      include: { accounts: true },
    });
    if (!agency) {
      return NextResponse.json({ error: "未找到" }, { status: 404 });
    }
    return NextResponse.json({
      ...agency,
      platform: agency.platform === "OTHER" ? "其他" : agency.platform,
      rebateRate: Number(agency.rebateRate),
      createdAt: agency.createdAt.toISOString(),
      updatedAt: agency.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("GET ad-agency error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const platform = body.platform !== undefined ? (platformMap[body.platform] ?? "OTHER") : undefined;
    const agency = await prisma.adAgency.update({
      where: { id: params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(platform !== undefined && { platform: platform }),
        ...(body.rebateRate !== undefined && { rebateRate: body.rebateRate }),
        ...(body.rebateConfig !== undefined && { rebateConfig: body.rebateConfig }),
        ...(body.settlementCurrency !== undefined && { settlementCurrency: body.settlementCurrency }),
        ...(body.creditTerm !== undefined && { creditTerm: body.creditTerm }),
        ...(body.contact !== undefined && { contact: body.contact }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    });
    return NextResponse.json({
      ...agency,
      platform: agency.platform === "OTHER" ? "其他" : agency.platform,
      rebateRate: Number(agency.rebateRate),
      createdAt: agency.createdAt.toISOString(),
      updatedAt: agency.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("PUT ad-agency error:", error);
    return NextResponse.json(
      { error: error.message || "更新失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userRole = session.user?.role;
    if (userRole !== "ADMIN" && userRole !== "MANAGER") {
      return NextResponse.json({ error: "没有权限" }, { status: 403 });
    }

    await prisma.adAgency.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE ad-agency error:", error);
    return NextResponse.json(
      { error: error.message || "删除失败" },
      { status: 500 }
    );
  }
}
