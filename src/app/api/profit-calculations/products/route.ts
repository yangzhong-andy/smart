import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const variants = await prisma.productVariant.findMany({
      select: {
        id: true,
        skuId: true,
        costPrice: true,
        weightKg: true,
        product: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json(
      variants.map((item) => ({
        id: item.id,
        skuId: item.skuId,
        name: item.product.name,
        purchaseCostCny: item.costPrice == null ? 0 : Number(item.costPrice),
        weightKg: item.weightKg == null ? null : Number(item.weightKg),
      }))
    );
  } catch (error) {
    return serverError("获取商品数据失败", error, { includeDetailsInDev: true });
  }
}
