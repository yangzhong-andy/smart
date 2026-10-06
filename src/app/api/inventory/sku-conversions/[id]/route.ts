import { InventoryMovementType, Prisma, StockLogReason, WarehouseFundEntryType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";
import { recordWarehouseFundEntry } from "@/lib/warehouse-funds";
import {
  calculateOutputQuantities,
  cancelSourceReservation,
  completeSourceStock,
} from "@/lib/warehouse-sku-conversion";

export const dynamic = "force-dynamic";

function serializeEvidence(value: unknown) {
  if (Array.isArray(value)) {
    const filtered = value.map(String).map((item) => item.trim()).filter(Boolean);
    return filtered.length ? JSON.stringify(filtered) : null;
  }
  const text = String(value || "").trim();
  return text || null;
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] });
  if (auth.response) return auth.response;
  try {
    const id = String(params.id || "").trim();
    const body = await request.json();
    const action = String(body.action || "").trim().toLowerCase();
    if (!id || !["complete", "cancel"].includes(action)) return NextResponse.json({ error: "拆装操作无效" }, { status: 400 });
    const operator = auth.user?.name || auth.user?.email || "管理员";

    const result = await prisma.$transaction(async (tx) => {
      const initial = await tx.warehouseSkuConversion.findUnique({ where: { id }, select: { warehouseId: true, sourceVariantId: true } });
      if (!initial) throw new Error("拆装单不存在");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sku-conversion:${initial.warehouseId}:${initial.sourceVariantId}`}))`;
      const conversion = await tx.warehouseSkuConversion.findUnique({
        where: { id },
        include: {
          warehouse: { select: { id: true, name: true, type: true } },
          sourceVariant: { select: { id: true, skuId: true, costPrice: true, currency: true } },
          outputs: { include: { variant: { select: { id: true, skuId: true, costPrice: true, currency: true } } } },
        },
      });
      if (!conversion) throw new Error("拆装单不存在");
      if (conversion.status !== "PROCESSING") throw new Error("只有拆装中的单据可以操作");
      const sourceStock = await tx.stock.findUnique({
        where: { variantId_warehouseId: { variantId: conversion.sourceVariantId, warehouseId: conversion.warehouseId } },
      });
      if (!sourceStock) throw new Error("母 SKU 库存记录不存在");

      if (action === "cancel") {
        const cancelled = cancelSourceReservation(sourceStock, conversion.plannedQty);
        await tx.stock.update({ where: { id: sourceStock.id }, data: { reservedQty: cancelled.reservedQty, availableQty: cancelled.availableQty } });
        const row = await tx.warehouseSkuConversion.update({
          where: { id },
          data: { status: "CANCELLED", cancelledAt: new Date(), completedBy: operator, completionNotes: String(body.notes || "").trim() || null },
        });
        return { action, conversion: row };
      }

      const completed = completeSourceStock(sourceStock, conversion.plannedQty, body.completedQty, body.damagedQty || 0);
      const actualFeeAmount = body.feeAmount == null ? Number(conversion.feeAmount) : Number(body.feeAmount);
      if (!Number.isFinite(actualFeeAmount) || actualFeeAmount < 0) throw new Error("实际拆装费不能小于 0");
      const actualFee = new Prisma.Decimal(actualFeeAmount).toDecimalPlaces(2);
      const outputQuantities = calculateOutputQuantities(completed.completedQty, conversion.outputs.map((output) => ({
        variantId: output.variantId,
        quantityPerSource: output.quantityPerSource,
      })));
      const operationDate = new Date();
      const sourceUnitCost = Number(conversion.sourceVariant.costPrice || 0);
      const sourceCurrency = conversion.sourceVariant.currency || "CNY";
      await tx.stock.update({
        where: { id: sourceStock.id },
        data: { qty: completed.qty, reservedQty: completed.reservedQty, availableQty: completed.availableQty },
      });
      let sourceBalance = sourceStock.qty;
      if (completed.completedQty > 0) {
        await tx.stockLog.create({ data: {
          variantId: conversion.sourceVariantId, warehouseId: conversion.warehouseId,
          reason: StockLogReason.TRANSFER_OUTBOUND, movementType: InventoryMovementType.TRANSFER,
          qty: -completed.completedQty, qtyBefore: sourceBalance, qtyAfter: sourceBalance - completed.completedQty,
          unitCost: new Prisma.Decimal(sourceUnitCost), totalCost: new Prisma.Decimal(sourceUnitCost).mul(completed.completedQty), currency: sourceCurrency,
          operator, operationDate, relatedOrderId: conversion.id, relatedOrderType: "WAREHOUSE_SKU_CONVERSION",
          relatedOrderNumber: conversion.conversionNo, notes: `SKU 拆装：${conversion.sourceVariant.skuId} 转换为子 SKU`,
        } });
        sourceBalance -= completed.completedQty;
      }
      if (completed.damagedQty > 0) {
        await tx.stockLog.create({ data: {
          variantId: conversion.sourceVariantId, warehouseId: conversion.warehouseId,
          reason: StockLogReason.DAMAGE_WRITE_OFF, movementType: InventoryMovementType.ADJUSTMENT,
          qty: -completed.damagedQty, qtyBefore: sourceBalance, qtyAfter: sourceBalance - completed.damagedQty,
          unitCost: new Prisma.Decimal(sourceUnitCost), totalCost: new Prisma.Decimal(sourceUnitCost).mul(completed.damagedQty), currency: sourceCurrency,
          operator, operationDate, relatedOrderId: conversion.id, relatedOrderType: "WAREHOUSE_SKU_CONVERSION_DAMAGE",
          relatedOrderNumber: conversion.conversionNo, notes: "SKU 拆装过程破损报废",
        } });
      }

      for (const outputQuantity of outputQuantities) {
        if (outputQuantity.quantity <= 0) continue;
        const output = conversion.outputs.find((item) => item.variantId === outputQuantity.variantId)!;
        const current = await tx.stock.findUnique({
          where: { variantId_warehouseId: { variantId: output.variantId, warehouseId: conversion.warehouseId } },
        });
        const qtyBefore = current?.qty || 0;
        const reservedQty = current?.reservedQty || 0;
        await tx.stock.upsert({
          where: { variantId_warehouseId: { variantId: output.variantId, warehouseId: conversion.warehouseId } },
          create: { variantId: output.variantId, warehouseId: conversion.warehouseId, qty: outputQuantity.quantity, reservedQty: 0, availableQty: outputQuantity.quantity },
          update: { qty: { increment: outputQuantity.quantity }, availableQty: { increment: outputQuantity.quantity } },
        });
        const unitCost = Number(output.variant.costPrice || 0);
        await tx.stockLog.create({ data: {
          variantId: output.variantId, warehouseId: conversion.warehouseId,
          reason: StockLogReason.TRANSFER_INBOUND, movementType: InventoryMovementType.TRANSFER,
          qty: outputQuantity.quantity, qtyBefore, qtyAfter: qtyBefore + outputQuantity.quantity,
          unitCost: new Prisma.Decimal(unitCost), totalCost: new Prisma.Decimal(unitCost).mul(outputQuantity.quantity), currency: output.variant.currency || sourceCurrency,
          operator, operationDate, relatedOrderId: conversion.id, relatedOrderType: "WAREHOUSE_SKU_CONVERSION",
          relatedOrderNumber: conversion.conversionNo,
          notes: `SKU 拆装入库；锁定库存保持 ${reservedQty} 件`,
        } });
      }

      if (actualFee.greaterThan(0)) {
        await recordWarehouseFundEntry(tx, {
          warehouseId: conversion.warehouseId,
          currency: conversion.feeCurrency,
          entryType: WarehouseFundEntryType.SERVICE_DEBIT,
          amount: actualFee.neg(),
          sourceType: "WAREHOUSE_SKU_CONVERSION",
          sourceId: conversion.id,
          occurredAt: operationDate,
          notes: `SKU 拆装费：${conversion.conversionNo}`,
          details: {
            conversionNo: conversion.conversionNo,
            sourceSku: conversion.sourceVariant.skuId,
            completedQty: completed.completedQty,
            damagedQty: completed.damagedQty,
            outputSkus: conversion.outputs.map((output) => ({ sku: output.variant.skuId, ratio: output.quantityPerSource })),
          },
          createdBy: operator,
        });
      }

      const row = await tx.warehouseSkuConversion.update({
        where: { id },
        data: {
          status: "COMPLETED",
          completedQty: completed.completedQty,
          damagedQty: completed.damagedQty,
          feeAmount: actualFee,
          evidence: serializeEvidence(body.evidence),
          completionNotes: String(body.notes || "").trim() || null,
          completedBy: operator,
          completedAt: operationDate,
        },
      });
      return { action, conversion: row, uncompletedQty: completed.uncompletedQty };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });

    await Promise.all([
      clearCacheByPrefix("stock"), clearCacheByPrefix("stock-logs"),
      clearCacheByPrefix("inventory"), clearCacheByPrefix("warehouse-funds"),
    ]);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    const message = error?.message || "拆装单操作失败";
    return NextResponse.json({ error: message }, { status: message.includes("库存") || message.includes("数量") || message.includes("拆装单") ? 400 : 500 });
  }
}
