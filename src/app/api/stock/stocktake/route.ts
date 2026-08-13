import { InventoryMovementType, Prisma, StockLogReason } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const serializeEvidence = (value: unknown) => {
  if (Array.isArray(value)) return value.filter(Boolean).length ? JSON.stringify(value.filter(Boolean)) : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const warehouseId = String(body.warehouseId || "").trim();
    const variantId = String(body.variantId || "").trim();
    const countedQty = Number(body.countedQty);
    const unitCost = Number(body.unitCost);
    const currency = String(body.currency || "").trim().toUpperCase();
    const reason = String(body.reason || "").trim();
    const evidence = serializeEvidence(body.evidence);
    const operationDate = body.operationDate ? new Date(body.operationDate) : new Date();

    if (!warehouseId || !variantId) return NextResponse.json({ error: "请选择仓库和 SKU" }, { status: 400 });
    if (!Number.isSafeInteger(countedQty) || countedQty < 0) {
      return NextResponse.json({ error: "盘点数量必须是大于等于 0 的整数" }, { status: 400 });
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) return NextResponse.json({ error: "请确认有效的单位采购成本" }, { status: 400 });
    if (!/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "请选择单位成本币种" }, { status: 400 });
    if (reason.length < 4) return NextResponse.json({ error: "请填写盘点原因或差异说明" }, { status: 400 });
    if (!evidence) return NextResponse.json({ error: "正式盘点必须上传盘点凭证" }, { status: 400 });
    if (Number.isNaN(operationDate.getTime()) || operationDate > new Date()) {
      return NextResponse.json({ error: "盘点时间无效，不能晚于当前时间" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stocktake:${warehouseId}:${variantId}`}))`;
      const [warehouse, variant] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true, name: true, type: true } }),
        tx.productVariant.findUnique({ where: { id: variantId }, select: { id: true, skuId: true, costPrice: true, currency: true } }),
      ]);
      if (!warehouse || warehouse.type !== "OVERSEAS") throw new Error("只能盘点有效的海外仓");
      if (!variant) throw new Error("SKU 不存在");

      const current = await tx.stock.findUnique({ where: { variantId_warehouseId: { variantId, warehouseId } } });
      const qtyBefore = current?.qty || 0;
      const reservedQty = Math.min(current?.reservedQty || 0, countedQty);
      const stock = await tx.stock.upsert({
        where: { variantId_warehouseId: { variantId, warehouseId } },
        create: { variantId, warehouseId, qty: countedQty, reservedQty, availableQty: countedQty - reservedQty },
        update: { qty: countedQty, reservedQty, availableQty: countedQty - reservedQty },
      });
      const difference = countedQty - qtyBefore;
      const log = await tx.stockLog.create({
        data: {
          variantId,
          warehouseId,
          reason: StockLogReason.STOCKTAKE_ADJUSTMENT,
          movementType: InventoryMovementType.STOCKTAKE,
          qty: difference,
          qtyBefore,
          qtyAfter: countedQty,
          unitCost: new Prisma.Decimal(unitCost),
          totalCost: new Prisma.Decimal(countedQty).mul(unitCost),
          currency,
          operator: auth.user?.name || auth.user?.email || "管理员",
          operationDate,
          relatedOrderType: "OVERSEAS_STOCKTAKE",
          relatedOrderNumber: `ST-${operationDate.toISOString().replace(/\D/g, "").slice(0, 14)}`,
          notes: `正式盘点：${reason}`,
          evidence,
        },
      });
      return { stock, log, warehouse, variant, difference };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

    await Promise.all([clearCacheByPrefix("stock"), clearCacheByPrefix("stock-logs"), clearCacheByPrefix("inventory")]);
    return NextResponse.json({
      success: true,
      warehouseName: result.warehouse.name,
      skuId: result.variant.skuId,
      qtyBefore: result.log.qtyBefore,
      countedQty: result.stock.qty,
      difference: result.difference,
      stockLogId: result.log.id,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "盘点入账失败" }, { status: 500 });
  }
}
