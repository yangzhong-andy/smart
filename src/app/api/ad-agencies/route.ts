import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

const platformMap: Record<string, "FB" | "Google" | "TikTok" | "OTHER"> = {
  FB: "FB",
  Google: "Google",
  TikTok: "TikTok",
  "其他": "OTHER",
  OTHER: "OTHER",
};

export async function GET() {
  try {
    const list = await prisma.adAgency.findMany({
      include: { accounts: true },
      orderBy: { createdAt: "desc" },
    });
    const serialized = list.map((a) => ({
      ...a,
      id: a.id,
      platform: a.platform === "OTHER" ? "其他" : a.platform,
      rebateRate: Number(a.rebateRate),
      rebateConfig: a.rebateConfig as object | null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));
    return NextResponse.json(serialized);
  } catch (error: any) {
    console.error("GET ad-agencies error:", error);
    return NextResponse.json(
      { error: error.message || "获取失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const platform = platformMap[body.platform] ?? "OTHER";
    const agency = await prisma.adAgency.create({
      data: {
        name: body.name,
        platform,
        rebateRate: body.rebateRate ?? 0,
        rebateConfig: body.rebateConfig ?? undefined,
        settlementCurrency: body.settlementCurrency,
        creditTerm: body.creditTerm,
        contact: body.contact,
        phone: body.phone,
        notes: body.notes,
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
    console.error("POST ad-agencies error:", error);
    return NextResponse.json(
      { error: error.message || "创建失败" },
      { status: 500 }
    );
  }
}
