import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 产品变体「海运中」字段合计（与库存查询页海运列一致；发运离境后、入海外仓前） */
export async function GET() {
  try {
    const agg = await prisma.productVariant.aggregate({
      _sum: { inTransit: true },
    });
    const inTransitTotal = Number(agg._sum.inTransit ?? 0);
    return NextResponse.json({ inTransitTotal });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
