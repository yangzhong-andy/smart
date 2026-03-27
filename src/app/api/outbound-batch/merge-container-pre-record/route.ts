import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOutboundBatchSkuPayload } from "@/lib/outbound-batch-serialize";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type BatchLike = {
  id: string;
  batchNumber: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  destinationCountry?: string | null;
  destinationPlatform?: string | null;
  destinationStoreId?: string | null;
  destinationStoreName?: string | null;
  outboundOrderId?: string | null;
  outboundBatchItems?: unknown[];
  outboundOrder?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const batchIds = Array.isArray(body?.batchIds)
      ? [...new Set((body.batchIds as unknown[]).map((id) => String(id).trim()).filter(Boolean))]
      : [];

    if (batchIds.length < 2) {
      return badRequest("请至少选择 2 个批次进行拼柜");
    }

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

    let rows: BatchLike[] = [];
    try {
      rows = (await prisma.outboundBatch.findMany({
        where: { id: { in: batchIds } },
        include: incFull as any,
      })) as any[];
    } catch (e) {
      console.error("[merge-container-pre-record] 回退查询（无 OutboundBatchItem 表？）:", e);
      const legacy = await prisma.outboundBatch.findMany({
        where: { id: { in: batchIds } },
        include: incLegacy as any,
      });
      rows = legacy.map((b: any) => ({ ...b, outboundBatchItems: [] }));
    }

    if (rows.length !== batchIds.length) {
      return badRequest("部分批次不存在，请刷新后重试");
    }

    const batchMap = new Map(rows.map((r) => [r.id, r]));
    const orderedBatches = batchIds.map((id) => batchMap.get(id)).filter(Boolean) as BatchLike[];

    const lineMap = new Map<
      string,
      {
        variantId: string | null;
        sku: string;
        skuName: string | null;
        spec: string | null;
        qty: number;
        unitVolumeCBM: number;
        unitWeightKG: number;
      }
    >();

    const sourceBatchNumbers: string[] = [];
    for (const batch of orderedBatches) {
      sourceBatchNumbers.push(batch.batchNumber);
      const payload = buildOutboundBatchSkuPayload(batch as any);
      for (const line of payload.skuLines) {
        const k = `${line.variantId ?? ""}__${line.sku}`;
        const prev = lineMap.get(k);
        if (!prev) {
          lineMap.set(k, {
            variantId: line.variantId ?? null,
            sku: line.sku || "",
            skuName: line.skuName ?? null,
            spec: line.spec ?? null,
            qty: line.qty || 0,
            unitVolumeCBM: line.unitVolumeCBM || 0,
            unitWeightKG: line.unitWeightKG || 0,
          });
          continue;
        }
        prev.qty += line.qty || 0;
      }
    }

    const mergedLines = Array.from(lineMap.values()).filter((l) => l.qty > 0);
    if (mergedLines.length === 0) {
      return badRequest("无法生成预录单：所选批次无可用 SKU 明细");
    }

    const variantIds: string[] = [
      ...new Set<string>(
        mergedLines
          .map((l) => (l.variantId ? String(l.variantId) : ""))
          .filter((v: string) => v.length > 0)
      ),
    ];
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
    const processedItems = mergedLines.map((line) => {
      const variantId = line.variantId ? String(line.variantId) : "";
      const bs = variantId ? boxSpecByVariant.get(variantId) : undefined;
      const perUnitFromBox =
        bs?.boxLengthCm && bs?.boxWidthCm && bs?.boxHeightCm && bs?.qtyPerBox
          ? (Number(bs.boxLengthCm) * Number(bs.boxWidthCm) * Number(bs.boxHeightCm)) /
            1000000 /
            Number(bs.qtyPerBox)
          : 0;
      const unitVolume = perUnitFromBox > 0 ? perUnitFromBox : line.unitVolumeCBM || 0;
      const perUnitWeightFromBox =
        bs?.weightKg && bs?.qtyPerBox ? Number(bs.weightKg) / Number(bs.qtyPerBox) : 0;
      const unitWeight = perUnitWeightFromBox > 0 ? perUnitWeightFromBox : line.unitWeightKG || 0;
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

    const firstBatch = orderedBatches[0];
    const name =
      (body.name as string | undefined)?.trim() ||
      `预录-拼柜-${new Date().toISOString().slice(0, 10)}`;
    const sourceMark = `来源批次：${sourceBatchNumbers.join("、")}`;
    const notesFromBody = (body.notes as string | undefined)?.trim() || "";
    const mergedNotes = notesFromBody ? `${notesFromBody}\n${sourceMark}` : sourceMark;

    const preRecord = await prisma.containerPreRecord.create({
      data: {
        name,
        status: "Draft",
        notes: mergedNotes,
        exporterId: body.exporterId || null,
        exporterName: body.exporterName || null,
        overseasCompanyId: body.overseasCompanyId || null,
        overseasCompanyName: body.overseasCompanyName || null,
        shippingMethod: body.shippingMethod || null,
        originPort: body.originPort || null,
        destinationPort: body.destinationPort || null,
        destinationCountry: body.destinationCountry ?? firstBatch.destinationCountry ?? null,
        loadingProductQty: loadingProductQty || 0,
        loadingLocation: body.loadingLocation || null,
        formFilledAt: body.formFilledAt ? new Date(body.formFilledAt) : new Date(),
        loadingDate: body.loadingDate ? new Date(body.loadingDate) : null,
        shippingWarehouseId: body.shippingWarehouseId || null,
        shippingWarehouseName: body.shippingWarehouseName || null,
        loadingLogisticsCompany: body.loadingLogisticsCompany || null,
        warehouseId: body.warehouseId ?? firstBatch.warehouseId ?? null,
        warehouseName: body.warehouseName ?? firstBatch.warehouseName ?? null,
        platform: body.platform ?? firstBatch.destinationPlatform ?? null,
        storeId: body.storeId ?? firstBatch.destinationStoreId ?? null,
        storeName: body.storeName ?? firstBatch.destinationStoreName ?? null,
        totalVolumeCBM: totalVolumeCBM || null,
        totalWeightKG: totalWeightKG || null,
        suggestedContainerType: suggestedContainerType || null,
        // 保持向后兼容：主关联写第一批次
        outboundBatchId: firstBatch.id,
        outboundOrderId: firstBatch.outboundOrderId ?? null,
        items: { create: processedItems },
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
      outboundBatchIds: orderedBatches.map((b) => b.id),
      outboundBatchNumbers: sourceBatchNumbers,
      itemCount: preRecord.items.length,
      createdAt: preRecord.createdAt.toISOString(),
    });
  } catch (error) {
    return serverError("合并批次生成预录单失败", error, { includeDetailsInDev: true });
  }
}
