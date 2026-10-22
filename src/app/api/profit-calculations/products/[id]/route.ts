import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { serverError } from "@/lib/api-response";
import { safeProfitSkuImageUrl } from "@/lib/platform-profit-skus";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const variant = await prisma.productVariant.findUnique({
      where: { id: params.id },
      select: { id: true, skuId: true, costPrice: true, currency: true, weightKg: true,
        product: { select: { name: true, mainImage: true } } },
    });
    if (!variant) return NextResponse.json({ error: "商品 SKU 不存在" }, { status: 404 });
    const image = variant.product.mainImage?.trim() || "";
    const dataImage = image.length <= 2_000_000 && /^data:image\/(?:jpeg|png|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/i.test(image);
    return NextResponse.json({
      id: variant.id, skuId: variant.skuId, name: variant.product.name,
      purchaseCostCny: variant.currency === "CNY" && variant.costPrice != null ? Number(variant.costPrice) : 0,
      costCurrency: variant.currency, weightKg: variant.weightKg == null ? null : Number(variant.weightKg),
      imageUrl: dataImage ? image : safeProfitSkuImageUrl(image),
    });
  } catch (error) {
    return serverError("获取商品详情失败", error);
  }
}
