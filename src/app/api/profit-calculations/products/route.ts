import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serverError } from "@/lib/api-response";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
    const variants = await prisma.productVariant.findMany({
      where: query ? { OR: [
        { skuId: { contains: query, mode: "insensitive" } },
        { product: { name: { contains: query, mode: "insensitive" } } },
      ] } : undefined,
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
      take: 100,
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
