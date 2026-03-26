import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOutboundBatchSkuPayload } from "@/lib/outbound-batch-serialize";
import { badRequest, notFound, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * POST /api/outbound-batch/[id]/container-pre-record
 * 根据批次 SKU 明细生成柜子预录单（可覆盖物流字段）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: batchId } = await params;
    const body = await request.json().catch(() => ({}));

    const incFull = {
      outboundBatchItems: { include: { variant: true } },
      outboundOrder: {
        include: {
          items: { include: { variant: true } },
          variant: true,
        },
      },
    } as const;
    const incLegacy = {
      outboundOrder: {
        include: {
          items: { include: { variant: true } },
          variant: true,
        },
      },
    } as const;

    let batch: Awaited<ReturnType<typeof prisma.outboundBatch.findUnique>> | null = null;
    try {
      batch = await prisma.outboundBatch.findUnique({
        where: { id: batchId },
        include: incFull as any,
      });
    } catch (e) {
      console.error("[container-pre-record] 回退查询（无 OutboundBatchItem 表？）:", e);
      batch = await prisma.outboundBatch.findUnique({
        where: { id: batchId },
        include: incLegacy as any,
      });
      if (batch) batch = { ...batch, outboundBatchItems: [] } as any;
    }

    if (!batch) {
      return notFound("出库批次不存在");
    }

    // findUnique 的联合类型未必含 outboundBatchItems，此处统一归一化
    const batchForSku = {
      ...batch,
      outboundBatchItems:
        (batch as { outboundBatchItems?: unknown }).outboundBatchItems ?? [],
    };

    const skuPayload = buildOutboundBatchSkuPayload(batchForSku as any);
    if (skuPayload.skuLines.length === 0) {
      return badRequest("无法生成预录单：批次无可用 SKU 明细");
    }

    const lines = skuPayload.skuLines;
    const variantIds = Array.from(
      new Set(
        lines
          .map((l) => (l?.variantId ? String(l.variantId) : ""))
          .filter((v) => v.length > 0)
      )
    );
    const boxSpecs = variantIds.length
      ? await prisma.boxSpec.findMany({
          where: { variantId: { in: variantIds } },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        })
      : [];
    const boxSpecByVariant = new Map<string, (typeof boxSpecs)[number]>();
    for (const bs of boxSpecs) {
      if (!boxSpecByVariant.has(bs.variantId)) boxSpecByVariant.set(bs.variantId, bs);
    }
    let totalVolumeCBM = 0;
    let totalWeightKG = 0;
    let loadingProductQty = 0;

    const processedItems = lines.map((line) => {
      const variantId = line.variantId ? String(line.variantId) : "";
      const bs = variantId ? boxSpecByVariant.get(variantId) : undefined;
      const perUnitFromBox =
        bs?.boxLengthCm && bs?.boxWidthCm && bs?.boxHeightCm && bs?.qtyPerBox
          ? (Number(bs.boxLengthCm) * Number(bs.boxWidthCm) * Number(bs.boxHeightCm)) / 1000000 / Number(bs.qtyPerBox)
          : 0;
      const unitVolume = perUnitFromBox > 0 ? perUnitFromBox : (line.unitVolumeCBM || 0);
      const perUnitWeightFromBox =
        bs?.weightKg && bs?.qtyPerBox ? Number(bs.weightKg) / Number(bs.qtyPerBox) : 0;
      const unitWeight = perUnitWeightFromBox > 0 ? perUnitWeightFromBox : (line.unitWeightKG || 0);
      const qty = line.qty || 0;
      const itemVolume = unitVolume * qty;
      const itemWeight = unitWeight * qty;
      totalVolumeCBM += itemVolume;
      totalWeightKG += itemWeight;
      loadingProductQty += qty;
      return {
        variantId: line.variantId || null,
        sku: line.sku || "",
        skuName: line.skuName || null,
        spec: line.spec || null,
        qty,
        unitVolumeCBM: unitVolume || null,
        unitWeightKG: unitWeight || null,
        totalVolumeCBM: itemVolume || null,
        totalWeightKG: itemWeight || null,
      };
    });

    let suggestedContainerType = "";
    if (totalVolumeCBM > 0) {
      if (totalVolumeCBM <= 33) suggestedContainerType = "20GP";
      else if (totalVolumeCBM <= 67) suggestedContainerType = "40GP";
      else suggestedContainerType = "40HQ";
    }

    const name =
      (body.name as string | undefined)?.trim() ||
      `预录-${batch.batchNumber}-${new Date().toISOString().slice(0, 10)}`;

    const preRecord = await prisma.containerPreRecord.create({
      data: {
        name,
        status: "Draft",
        notes: (body.notes as string | undefined) ?? null,
        exporterId: body.exporterId || null,
        exporterName: body.exporterName || null,
        overseasCompanyId: body.overseasCompanyId || null,
        overseasCompanyName: body.overseasCompanyName || null,
        shippingMethod: body.shippingMethod || null,
        originPort: body.originPort || null,
        destinationPort: body.destinationPort || null,
        destinationCountry:
          body.destinationCountry ?? batch.destinationCountry ?? null,
        loadingProductQty: loadingProductQty || 0,
        loadingLocation: body.loadingLocation || null,
        formFilledAt: body.formFilledAt ? new Date(body.formFilledAt) : new Date(),
        loadingDate: body.loadingDate ? new Date(body.loadingDate) : null,
        shippingWarehouseId: body.shippingWarehouseId || null,
        shippingWarehouseName: body.shippingWarehouseName || null,
        loadingLogisticsCompany: body.loadingLogisticsCompany || null,
        warehouseId: body.warehouseId ?? batch.warehouseId ?? null,
        warehouseName: body.warehouseName ?? batch.warehouseName ?? null,
        platform: body.platform ?? batch.destinationPlatform ?? null,
        storeId: body.storeId ?? batch.destinationStoreId ?? null,
        storeName: body.storeName ?? batch.destinationStoreName ?? null,
        totalVolumeCBM: totalVolumeCBM || null,
        totalWeightKG: totalWeightKG || null,
        suggestedContainerType: suggestedContainerType || null,
        outboundBatchId: batch.id,
        outboundOrderId: batch.outboundOrderId,
        items: {
          create: processedItems,
        },
      } as any,
      include: { items: true },
    });

    return NextResponse.json({
      id: preRecord.id,
      name: preRecord.name,
      status: preRecord.status,
      totalVolumeCBM: preRecord.totalVolumeCBM?.toString(),
      totalWeightKG: preRecord.totalWeightKG?.toString(),
      suggestedContainerType: preRecord.suggestedContainerType,
      outboundBatchId: batch.id,
      outboundOrderId: batch.outboundOrderId,
      itemCount: preRecord.items.length,
      createdAt: preRecord.createdAt.toISOString(),
    });
  } catch (error) {
    return serverError("从批次生成预录单失败", error, { includeDetailsInDev: true });
  }
}
