import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { normalizeConversionOutputs, reserveSourceStock } from "@/lib/warehouse-sku-conversion";

export const dynamic = "force-dynamic";

const conversionInclude = {
  warehouse: { select: { id: true, code: true, name: true, type: true } },
  sourceVariant: { select: { id: true, skuId: true, color: true, size: true, product: { select: { name: true } } } },
  outputs: {
    orderBy: { createdAt: "asc" as const },
    include: { variant: { select: { id: true, skuId: true, color: true, size: true, product: { select: { name: true } } } } },
  },
} satisfies Prisma.WarehouseSkuConversionInclude;

function serializeConversion(row: any) {
  return { ...row, feeAmount: Number(row.feeAmount) };
}

function conversionNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `SC-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;
  try {
    const [conversions, warehouses, stocks, variants] = await Promise.all([
      prisma.warehouseSkuConversion.findMany({
        include: conversionInclude,
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.warehouse.findMany({
        where: { type: "OVERSEAS", isActive: true },
        select: { id: true, code: true, name: true, type: true },
        orderBy: { name: "asc" },
      }),
      prisma.stock.findMany({
        where: { warehouse: { type: "OVERSEAS", isActive: true } },
        select: {
          id: true, warehouseId: true, variantId: true, qty: true, reservedQty: true, availableQty: true,
          variant: { select: { id: true, skuId: true, color: true, size: true, product: { select: { name: true } } } },
        },
        orderBy: { variant: { skuId: "asc" } },
      }),
      prisma.productVariant.findMany({
        select: { id: true, skuId: true, color: true, size: true, product: { select: { name: true } } },
        orderBy: { skuId: "asc" },
      }),
    ]);
    return NextResponse.json({
      conversions: conversions.map(serializeConversion),
      warehouses,
      stocks,
      variants,
    }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "拆装数据加载失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const warehouseId = String(body.warehouseId || "").trim();
    const sourceVariantId = String(body.sourceVariantId || "").trim();
    const feeAmount = Number(body.feeAmount || 0);
    const feeCurrency = String(body.feeCurrency || "BRL").trim().toUpperCase();
    const notes = String(body.notes || "").trim() || null;
    if (!warehouseId || !sourceVariantId) return NextResponse.json({ error: "请选择海外仓和母 SKU" }, { status: 400 });
    if (!Number.isFinite(feeAmount) || feeAmount < 0) return NextResponse.json({ error: "拆装费用不能小于 0" }, { status: 400 });
    if (!/^[A-Z]{3}$/.test(feeCurrency)) return NextResponse.json({ error: "费用币种格式不正确" }, { status: 400 });
    const outputs = normalizeConversionOutputs(sourceVariantId, body.outputs || []);

    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sku-conversion:${warehouseId}:${sourceVariantId}`}))`;
      const [warehouse, sourceVariant, targetCount, sourceStock] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, type: true } }),
        tx.productVariant.findUnique({ where: { id: sourceVariantId }, select: { id: true } }),
        tx.productVariant.count({ where: { id: { in: outputs.map((output) => output.variantId) } } }),
        tx.stock.findUnique({ where: { variantId_warehouseId: { variantId: sourceVariantId, warehouseId } } }),
      ]);
      if (!warehouse || warehouse.type !== "OVERSEAS") throw new Error("只能在有效的海外仓发起拆装");
      if (!sourceVariant) throw new Error("母 SKU 不存在");
      if (targetCount !== outputs.length) throw new Error("存在无效的拆装后 SKU");
      if (!sourceStock) throw new Error("该母 SKU 在所选仓库没有库存记录");
      const reserved = reserveSourceStock(sourceStock, body.plannedQty);
      await tx.stock.update({
        where: { id: sourceStock.id },
        data: { reservedQty: reserved.reservedQty, availableQty: reserved.availableQty },
      });
      return tx.warehouseSkuConversion.create({
        data: {
          conversionNo: conversionNumber(),
          warehouseId,
          sourceVariantId,
          plannedQty: reserved.plannedQty,
          feeAmount: new Prisma.Decimal(feeAmount).toDecimalPlaces(2),
          feeCurrency,
          notes,
          createdBy: auth.user?.name || auth.user?.email || "管理员",
          outputs: { create: outputs },
        },
        include: conversionInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

    await Promise.all([clearCacheByPrefix("stock"), clearCacheByPrefix("inventory")]);
    return NextResponse.json({ success: true, conversion: serializeConversion(result) });
  } catch (error: any) {
    const message = error?.message || "拆装单创建失败";
    return NextResponse.json({ error: message }, { status: message.includes("库存") || message.includes("SKU") || message.includes("数量") || message.includes("比例") ? 400 : 500 });
  }
}
