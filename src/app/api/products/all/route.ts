import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/all
 * 获取所有产品（包含variants，用于预录单选择）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "100", 10), 100);

    const [rows, total] = await prisma.$transaction([
      prisma.product.findMany({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: {
          variants: {
            where: { /* 可以添加条件 */ },
            select: {
              id: true,
              skuId: true,
              color: true,
              size: true,
              weightKg: true,
              lengthCm: true,
              widthCm: true,
              heightCm: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.product.count({ where: { status: "ACTIVE" } }),
    ]);

    const data = rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category || undefined,
      status: p.status,
      mainImage: p.mainImage || undefined,
      variants: p.variants.map((v) => ({
        id: v.id,
        skuId: v.skuId,
        color: v.color || undefined,
        size: v.size || undefined,
        weightKg: v.weightKg ? Number(v.weightKg) : undefined,
        lengthCm: v.lengthCm ? Number(v.lengthCm) : undefined,
        widthCm: v.widthCm ? Number(v.widthCm) : undefined,
        heightCm: v.heightCm ? Number(v.heightCm) : undefined,
        // 计算体积 (CBM)
        volumeCBM: v.lengthCm && v.widthCm && v.heightCm
          ? (Number(v.lengthCm) * Number(v.widthCm) * Number(v.heightCm)) / 1000000
          : undefined,
      })),
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("获取产品列表失败:", error);
    return NextResponse.json({ error: "获取产品列表失败" }, { status: 500 });
  }
}
