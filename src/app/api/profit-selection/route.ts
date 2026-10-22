import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { isProfitEstimatePlatform } from "@/lib/profit-estimate";
import { serverError } from "@/lib/api-response";
import { parseSelectionImage } from "@/lib/profit-selection-image";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const platform = request.nextUrl.searchParams.get("platform");
    if (platform && !isProfitEstimatePlatform(platform)) return NextResponse.json({ error: "平台无效" }, { status: 400 });
    const rows = await prisma.profitSelectionItem.findMany({
      where: platform ? { platform } : undefined,
      include: { productVariant: { select: { skuId: true, product: { select: { name: true } } } }, image: { select: { itemId: true } } },
      orderBy: { updatedAt: "desc" }, take: 500,
    });
    return NextResponse.json(rows.map((row) => ({
      id: row.id, platform: row.platform, name: row.name, sellerSku: row.sellerSku,
      imageUrl: row.image ? `/api/profit-selection/${row.id}/image` : null,
      productVariantId: row.productVariantId, linkedSku: row.productVariant?.skuId || null,
      purchaseCostCny: Number(row.purchaseCostCny), weightKg: row.weightKg == null ? null : Number(row.weightKg),
      targetPriceBrl: row.targetPriceBrl == null ? null : Number(row.targetPriceBrl),
      firstLegCny: Number(row.firstLegCny), status: row.status, notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
    })));
  } catch (error) {
    return serverError("读取价格选品表失败", error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const platform = body.platform;
    const name = String(body.name || "").trim();
    if (!isProfitEstimatePlatform(platform) || !name || name.length > 200) {
      return NextResponse.json({ error: "请填写有效平台和商品名称" }, { status: 400 });
    }
    const numeric = (value: unknown, field: string, nullable = false) => {
      if (nullable && (value == null || value === "")) return null;
      const n = Number(value ?? 0);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${field}必须为非负数字`);
      return n;
    };
    const productVariantId = body.productVariantId ? String(body.productVariantId) : null;
    if (productVariantId && !(await prisma.productVariant.findUnique({ where: { id: productVariantId }, select: { id: true } }))) {
      return NextResponse.json({ error: "关联的商品 SKU 不存在" }, { status: 400 });
    }
    const status = ["CANDIDATE", "SHORTLIST", "REJECTED"].includes(body.status) ? body.status : "CANDIDATE";
    const image = body.imageDataUrl ? parseSelectionImage(body.imageDataUrl) : null;
    const created = await prisma.profitSelectionItem.create({ data: {
      platform, name, sellerSku: String(body.sellerSku || "").trim() || null,
      productVariantId, purchaseCostCny: numeric(body.purchaseCostCny, "采购成本")!,
      weightKg: numeric(body.weightKg, "重量", true), targetPriceBrl: numeric(body.targetPriceBrl, "目标售价", true),
      firstLegCny: numeric(body.firstLegCny, "头程物流费")!, status,
      notes: String(body.notes || "").trim().slice(0, 2000) || null,
      ...(image ? { image: { create: image } } : {}),
    } });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (/必须为非负数字|图片/.test(error.message))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return serverError("保存价格选品失败", error);
  }
}
