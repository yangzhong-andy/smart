import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ComponentInput = { variantId?: unknown; quantity?: unknown };

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

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const [mappings, variants, warehouses] = await Promise.all([
      prisma.warehouseSkuMapping.findMany({
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          components: {
            include: { variant: { select: { id: true, skuId: true, product: { select: { name: true } } } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ warehouse: { name: "asc" } }, { warehouseSku: "asc" }],
      }),
      prisma.productVariant.findMany({
        select: {
          id: true,
          skuId: true,
          weightKg: true,
          lengthCm: true,
          widthCm: true,
          heightCm: true,
          product: { select: { name: true } },
        },
        orderBy: { skuId: "asc" },
      }),
      prisma.warehouse.findMany({
        where: { type: "OVERSEAS", isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      mappings,
      warehouses,
      variants: variants.map((variant) => ({
        ...variant,
        weightKg: variant.weightKg == null ? null : Number(variant.weightKg),
        lengthCm: variant.lengthCm == null ? null : Number(variant.lengthCm),
        widthCm: variant.widthCm == null ? null : Number(variant.widthCm),
        heightCm: variant.heightCm == null ? null : Number(variant.heightCm),
      })),
    });
  } catch (error: any) {
    console.error("[Warehouse SKU Mappings]", error);
    return NextResponse.json({ error: error?.message || "仓库 SKU 映射读取失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const id = String(body?.id || "").trim();
    const warehouseId = String(body?.warehouseId || "").trim();
    const warehouseSku = String(body?.warehouseSku || "").trim();
    const notes = String(body?.notes || "").trim() || null;
    const components = normalizeComponents(body?.components);
    if (!warehouseId || !warehouseSku || warehouseSku.length > 120 || components.length === 0) {
      return NextResponse.json({ error: "请选择仓库、填写仓库 SKU，并至少添加一个内部 SKU" }, { status: 400 });
    }

    const [warehouse, variants, existingMapping] = await Promise.all([
      prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } }),
      prisma.productVariant.findMany({
        where: { id: { in: components.map((component) => component.variantId) } },
        select: { id: true },
      }),
      id ? prisma.warehouseSkuMapping.findUnique({ where: { id }, select: { id: true } }) : Promise.resolve(null),
    ]);
    if (!warehouse || warehouse.type !== "OVERSEAS") return NextResponse.json({ error: "海外仓不存在" }, { status: 400 });
    if (id && !existingMapping) return NextResponse.json({ error: "要编辑的映射不存在，请刷新页面后重试" }, { status: 404 });
    if (variants.length !== components.length) return NextResponse.json({ error: "映射中包含不存在的内部 SKU" }, { status: 400 });

    const mapping = await prisma.$transaction(async (tx) => {
      const saved = id
        ? await tx.warehouseSkuMapping.update({ where: { id }, data: { warehouseId, warehouseSku, notes } })
        : await tx.warehouseSkuMapping.create({ data: { warehouseId, warehouseSku, notes } });
      await tx.warehouseSkuMappingComponent.deleteMany({ where: { mappingId: saved.id } });
      await tx.warehouseSkuMappingComponent.createMany({
        data: components.map((component) => ({ mappingId: saved.id, ...component })),
      });
      return saved;
    });
    return NextResponse.json({ success: true, id: mapping.id });
  } catch (error: any) {
    console.error("[Warehouse SKU Mappings]", error);
    const message = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      ? "该仓库 SKU 已存在，请直接编辑原映射"
      : error?.message || "仓库 SKU 映射保存失败";
    const status = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireApiUser(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id || typeof body?.enabled !== "boolean") return NextResponse.json({ error: "状态参数无效" }, { status: 400 });
    await prisma.warehouseSkuMapping.update({ where: { id }, data: { enabled: body.enabled } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Warehouse SKU Mappings]", error);
    return NextResponse.json({ error: error?.message || "仓库 SKU 映射状态更新失败" }, { status: 500 });
  }
}
