import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "50", 10), 200);
    const country = searchParams.get("country");
    const platform = searchParams.get("platform");
    const storeId = searchParams.get("storeId");
    const ownerId = searchParams.get("ownerId");
    const skuId = searchParams.get("skuId");
    const bizType = searchParams.get("bizType");

    const where: Record<string, unknown> = {};
    if (country) where.country = country;
    if (platform) where.platform = platform;
    if (storeId) where.storeId = storeId;
    if (ownerId) where.toOwnerId = ownerId;
    if (skuId) where.skuId = { contains: skuId, mode: "insensitive" };
    if (bizType) where.bizType = bizType;

    const [rows, total] = await prisma.$transaction([
      prisma.inventoryOwnershipLedger.findMany({
        where,
        orderBy: { eventTime: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryOwnershipLedger.count({ where }),
    ]);

    return NextResponse.json({
      data: rows.map((r) => ({
        ...r,
        eventTime: r.eventTime.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询货权台账失败" },
      { status: 500 }
    );
  }
}
