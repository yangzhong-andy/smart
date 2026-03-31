import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/container-pre-records/[id]
 * 获取预录单详情
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const preRecord = await prisma.containerPreRecord.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!preRecord) {
      return notFound("预录单不存在");
    }

    return NextResponse.json({
      id: preRecord.id,
      name: preRecord.name,
      status: preRecord.status,
      notes: preRecord.notes,
      exporterId: preRecord.exporterId,
      exporterName: preRecord.exporterName,
      overseasCompanyId: preRecord.overseasCompanyId,
      overseasCompanyName: preRecord.overseasCompanyName,
      shippingMethod: preRecord.shippingMethod,
      originPort: preRecord.originPort,
      destinationPort: preRecord.destinationPort,
      destinationCountry: preRecord.destinationCountry,
      loadingProductQty: (preRecord as any).loadingProductQty ?? undefined,
      loadingLocation: (preRecord as any).loadingLocation,
      formFilledAt: (preRecord as any).formFilledAt?.toISOString?.(),
      loadingDate: (preRecord as any).loadingDate?.toISOString?.(),
      shippingWarehouseId: (preRecord as any).shippingWarehouseId,
      shippingWarehouseName: (preRecord as any).shippingWarehouseName,
      loadingLogisticsCompany: (preRecord as any).loadingLogisticsCompany,
      warehouseId: preRecord.warehouseId,
      warehouseName: preRecord.warehouseName,
      platform: preRecord.platform,
      storeId: preRecord.storeId,
      storeName: preRecord.storeName,
      totalVolumeCBM: preRecord.totalVolumeCBM?.toString(),
      totalWeightKG: preRecord.totalWeightKG?.toString(),
      suggestedContainerType: preRecord.suggestedContainerType,
      containerId: preRecord.containerId,
      items: preRecord.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.sku,
        skuName: item.skuName,
        spec: item.spec,
        qty: item.qty,
        unitVolumeCBM: item.unitVolumeCBM?.toString(),
        unitWeightKG: item.unitWeightKG?.toString(),
        totalVolumeCBM: item.totalVolumeCBM?.toString(),
        totalWeightKG: item.totalWeightKG?.toString(),
      })),
      createdAt: preRecord.createdAt.toISOString(),
      updatedAt: preRecord.updatedAt.toISOString(),
    });
  } catch (error) {
    return serverError("获取预录单详情失败", error, { includeDetailsInDev: true });
  }
}

/**
 * PUT /api/container-pre-records/[id]
 * 更新预录单
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const exists = await prisma.containerPreRecord.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!exists) {
      return notFound("预录单不存在");
    }

    if (exists.status === "Converted") {
      return badRequest("已转柜的预录单无法修改");
    }

    // 如果更新了产品明细，需要重新计算体积（优先按箱规）
    let totalVolumeCBM = body.totalVolumeCBM;
    let totalWeightKG = body.totalWeightKG;
    let suggestedContainerType = body.suggestedContainerType;
    let loadingProductQty = body.loadingProductQty;

    if (body.items) {
      totalVolumeCBM = 0;
      totalWeightKG = 0;
      loadingProductQty = 0;
      const variantIds: string[] = [
        ...new Set<string>(
          (body.items as any[])
            .map((it) => (it?.variantId ? String(it.variantId) : ""))
            .filter((v: string) => v.length > 0)
        ),
      ];
      const boxSpecs: any[] = variantIds.length
        ? await (prisma as any).boxSpec.findMany({
            where: { variantId: { in: variantIds } },
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          })
        : [];
      const boxSpecByVariant = new Map<string, any>();
      for (const bs of boxSpecs) {
        if (!boxSpecByVariant.has(bs.variantId)) boxSpecByVariant.set(bs.variantId, bs);
      }
      
      for (const item of body.items) {
        const qty = Number(item.qty) || 0;
        const variantId = item.variantId ? String(item.variantId) : "";
        const bs = variantId ? boxSpecByVariant.get(variantId) : undefined;
        const perUnitFromBox =
          bs?.boxLengthCm && bs?.boxWidthCm && bs?.boxHeightCm && bs?.qtyPerBox
            ? (Number(bs.boxLengthCm) * Number(bs.boxWidthCm) * Number(bs.boxHeightCm)) / 1000000 / Number(bs.qtyPerBox)
            : 0;
        const unitVolume = perUnitFromBox > 0 ? perUnitFromBox : (parseFloat(item.unitVolumeCBM) || 0);
        const perUnitWeightFromBox =
          bs?.weightKg && bs?.qtyPerBox ? Number(bs.weightKg) / Number(bs.qtyPerBox) : 0;
        const unitWeight = perUnitWeightFromBox > 0 ? perUnitWeightFromBox : (parseFloat(item.unitWeightKG) || 0);
        totalVolumeCBM += unitVolume * qty;
        totalWeightKG += unitWeight * qty;
        loadingProductQty += qty;
      }
      
      if (totalVolumeCBM <= 33) {
        suggestedContainerType = "20GP";
      } else if (totalVolumeCBM <= 67) {
        suggestedContainerType = "40GP";
      } else {
        suggestedContainerType = "40HQ";
      }
    }

    // 先删除旧的产品明细
    await prisma.containerPreRecordItem.deleteMany({
      where: { preRecordId: id },
    });

    // 更新预录单并创建新产品明细
    const preRecord = await prisma.containerPreRecord.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        notes: body.notes ?? undefined,
        exporterId: body.exporterId ?? undefined,
        exporterName: body.exporterName ?? undefined,
        overseasCompanyId: body.overseasCompanyId ?? undefined,
        overseasCompanyName: body.overseasCompanyName ?? undefined,
        shippingMethod: body.shippingMethod ?? undefined,
        originPort: body.originPort ?? undefined,
        destinationPort: body.destinationPort ?? undefined,
        destinationCountry: body.destinationCountry ?? undefined,
        loadingProductQty: loadingProductQty != null ? Number(loadingProductQty) : undefined,
        loadingLocation: body.loadingLocation ?? undefined,
        formFilledAt: body.formFilledAt !== undefined ? toDateOrNull(body.formFilledAt) : undefined,
        loadingDate: body.loadingDate !== undefined ? toDateOrNull(body.loadingDate) : undefined,
        shippingWarehouseId: body.shippingWarehouseId ?? undefined,
        shippingWarehouseName: body.shippingWarehouseName ?? undefined,
        loadingLogisticsCompany: body.loadingLogisticsCompany ?? undefined,
        warehouseId: body.warehouseId ?? undefined,
        warehouseName: body.warehouseName ?? undefined,
        platform: body.platform ?? undefined,
        storeId: body.storeId ?? undefined,
        storeName: body.storeName ?? undefined,
        totalVolumeCBM: totalVolumeCBM != null ? Number(totalVolumeCBM) : undefined,
        totalWeightKG: totalWeightKG != null ? Number(totalWeightKG) : undefined,
        suggestedContainerType: suggestedContainerType ?? undefined,
        status: body.status ?? undefined,
        items: body.items ? {
          create: body.items.map((item: any) => ({
            variantId: item.variantId || null,
            sku: item.sku || "",
            skuName: item.skuName || null,
            spec: item.spec || null,
            qty: item.qty || 0,
            unitVolumeCBM: item.unitVolumeCBM != null ? Number(item.unitVolumeCBM) : null,
            unitWeightKG: item.unitWeightKG != null ? Number(item.unitWeightKG) : null,
            totalVolumeCBM: item.totalVolumeCBM != null ? Number(item.totalVolumeCBM) : null,
            totalWeightKG: item.totalWeightKG != null ? Number(item.totalWeightKG) : null,
          })),
        } : undefined,
      } as any,
      include: {
        items: true,
      },
    });

    return NextResponse.json({
      id: preRecord.id,
      status: preRecord.status,
      totalVolumeCBM: preRecord.totalVolumeCBM?.toString(),
      totalWeightKG: preRecord.totalWeightKG?.toString(),
      suggestedContainerType: preRecord.suggestedContainerType,
      updatedAt: preRecord.updatedAt.toISOString(),
    });
  } catch (error) {
    return serverError("更新预录单失败", error, { includeDetailsInDev: true });
  }
}

/**
 * DELETE /api/container-pre-records/[id]
 * 删除预录单
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const exists = await prisma.containerPreRecord.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!exists) {
      return notFound("预录单不存在");
    }

    if (exists.status === "Converted") {
      return badRequest("已转柜的预录单无法删除");
    }

    await prisma.containerPreRecord.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("删除预录单失败", error, { includeDetailsInDev: true });
  }
}
