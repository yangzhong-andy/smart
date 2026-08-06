import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ComponentInput = {
  variantId?: unknown;
  quantity?: unknown;
};

function normalizeComponents(value: unknown) {
  if (!Array.isArray(value)) return [];
  const totals = new Map<string, number>();
  for (const raw of value as ComponentInput[]) {
    const variantId = String(raw?.variantId || "").trim();
    const quantity = Math.round(Number(raw?.quantity));
    if (!variantId || !Number.isFinite(quantity) || quantity < 1 || quantity > 999) continue;
    totals.set(variantId, (totals.get(variantId) || 0) + quantity);
  }
  return [...totals].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const platform = String(body?.platform || "TIKTOK").trim().toUpperCase();
    const shopId = String(body?.shopId || "").trim();
    const sellerSku = String(body?.sellerSku || "").trim();
    const components = normalizeComponents(body?.components);

    if (!platform || !shopId || !sellerSku || components.length === 0) {
      return NextResponse.json({ error: "店铺、销售 SKU 和成本组成不能为空" }, { status: 400 });
    }

    const [shop, variants] = await Promise.all([
      prisma.tikTokShopSetting.findUnique({ where: { shopId }, select: { shopId: true } }),
      prisma.productVariant.findMany({
        where: { id: { in: components.map((component) => component.variantId) } },
        select: { id: true },
      }),
    ]);
    if (!shop) return NextResponse.json({ error: "店铺不存在" }, { status: 400 });
    if (variants.length !== components.length) {
      return NextResponse.json({ error: "成本组成中包含不存在的内部 SKU" }, { status: 400 });
    }

    const mapping = await prisma.$transaction(async (tx) => {
      const saved = await tx.profitSkuMapping.upsert({
        where: { platform_shopId_sellerSku: { platform, shopId, sellerSku } },
        create: { platform, shopId, sellerSku },
        update: {},
        select: { id: true },
      });
      await tx.profitSkuMappingComponent.deleteMany({ where: { mappingId: saved.id } });
      await tx.profitSkuMappingComponent.createMany({
        data: components.map((component) => ({ mappingId: saved.id, ...component })),
      });
      return saved;
    });

    return NextResponse.json({ success: true, id: mapping.id });
  } catch (error: any) {
    console.error("[Profit SKU Mapping]", error);
    return NextResponse.json({ error: error?.message || "成本映射保存失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const platform = (request.nextUrl.searchParams.get("platform") || "TIKTOK").trim().toUpperCase();
    const shopId = (request.nextUrl.searchParams.get("shopId") || "").trim();
    const sellerSku = (request.nextUrl.searchParams.get("sellerSku") || "").trim();
    if (!shopId || !sellerSku) {
      return NextResponse.json({ error: "缺少店铺或销售 SKU" }, { status: 400 });
    }

    await prisma.profitSkuMapping.deleteMany({ where: { platform, shopId, sellerSku } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Profit SKU Mapping]", error);
    return NextResponse.json({ error: error?.message || "成本映射删除失败" }, { status: 500 });
  }
}
