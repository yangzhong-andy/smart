import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { isProfitEstimatePlatform } from "@/lib/profit-estimate";
import { serverError } from "@/lib/api-response";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    if (body.platform != null && !isProfitEstimatePlatform(body.platform)) return NextResponse.json({ error: "平台无效" }, { status: 400 });
    if (body.name != null && (!String(body.name).trim() || String(body.name).length > 200)) return NextResponse.json({ error: "商品名称无效" }, { status: 400 });
    if (body.status != null && !["CANDIDATE", "SHORTLIST", "REJECTED"].includes(body.status)) return NextResponse.json({ error: "状态无效" }, { status: 400 });
    const numbers: Record<string, number | null> = {};
    for (const key of ["purchaseCostCny", "weightKg", "targetPriceBrl", "firstLegCny"]) {
      if (body[key] === undefined) continue;
      if ((key === "weightKg" || key === "targetPriceBrl") && (body[key] === null || body[key] === "")) {
        numbers[key] = null; continue;
      }
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: `${key} 必须为非负数字` }, { status: 400 });
      numbers[key] = value;
    }
    if (body.productVariantId) {
      const variant = await prisma.productVariant.findUnique({ where: { id: String(body.productVariantId) }, select: { id: true } });
      if (!variant) return NextResponse.json({ error: "关联的商品 SKU 不存在" }, { status: 400 });
    }
    const updated = await prisma.profitSelectionItem.update({ where: { id: params.id }, data: {
      ...(body.platform != null ? { platform: body.platform } : {}),
      ...(body.name != null ? { name: String(body.name).trim() } : {}),
      ...(body.sellerSku !== undefined ? { sellerSku: String(body.sellerSku || "").trim() || null } : {}),
      ...(body.productVariantId !== undefined ? { productVariantId: body.productVariantId ? String(body.productVariantId) : null } : {}),
      ...(body.status != null ? { status: body.status } : {}),
      ...(body.notes !== undefined ? { notes: String(body.notes || "").trim().slice(0, 2000) || null } : {}),
      ...numbers,
    } });
    return NextResponse.json({ id: updated.id });
  } catch (error) {
    return serverError("更新价格选品失败", error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    await prisma.profitSelectionItem.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除价格选品失败", error);
  }
}
