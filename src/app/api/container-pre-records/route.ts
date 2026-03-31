import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/container-pre-records
 * 获取预录单列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const outboundBatchId = searchParams.get("outboundBatchId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 50);

    const where: any = {};
    if (status) where.status = status;
    if (outboundBatchId) where.outboundBatchId = outboundBatchId;

    const [rows, total] = await prisma.$transaction([
      prisma.containerPreRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          items: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.containerPreRecord.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      notes: r.notes,
      outboundBatchId: r.outboundBatchId ?? undefined,
      outboundOrderId: r.outboundOrderId ?? undefined,
      exporterId: r.exporterId,
      exporterName: r.exporterName,
      overseasCompanyId: r.overseasCompanyId,
      overseasCompanyName: r.overseasCompanyName,
      shippingMethod: r.shippingMethod,
      originPort: r.originPort,
      destinationPort: r.destinationPort,
      destinationCountry: r.destinationCountry,
      loadingProductQty: (r as any).loadingProductQty ?? undefined,
      loadingLocation: (r as any).loadingLocation ?? undefined,
      formFilledAt: (r as any).formFilledAt?.toISOString?.() ?? undefined,
      loadingDate: (r as any).loadingDate?.toISOString?.() ?? undefined,
      shippingWarehouseId: (r as any).shippingWarehouseId ?? undefined,
      shippingWarehouseName: (r as any).shippingWarehouseName ?? undefined,
      loadingLogisticsCompany: (r as any).loadingLogisticsCompany ?? undefined,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      platform: r.platform,
      storeId: r.storeId,
      storeName: r.storeName,
      totalVolumeCBM: r.totalVolumeCBM ? r.totalVolumeCBM.toString() : undefined,
      totalWeightKG: r.totalWeightKG ? r.totalWeightKG.toString() : undefined,
      suggestedContainerType: r.suggestedContainerType,
      containerId: r.containerId,
      itemCount: r.items.length,
      items: r.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.sku,
        skuName: item.skuName,
        spec: item.spec,
        qty: item.qty,
        unitVolumeCBM: item.unitVolumeCBM ? item.unitVolumeCBM.toString() : undefined,
        unitWeightKG: item.unitWeightKG ? item.unitWeightKG.toString() : undefined,
        totalVolumeCBM: item.totalVolumeCBM ? item.totalVolumeCBM.toString() : undefined,
        totalWeightKG: item.totalWeightKG ? item.totalWeightKG.toString() : undefined,
      })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return serverError("获取预录单列表失败", error, { includeDetailsInDev: true });
  }
}

/**
 * POST /api/container-pre-records
 * 创建预录单
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const items = body.items || [];
    if (items.length === 0) {
      return badRequest("请添加产品明细");
    }

    // 优先按箱规计算体积；无箱规时回退用传入单件体积
    let totalVolumeCBM = 0;
    let totalWeightKG = 0;
    let loadingProductQty = 0;
    const variantIds: string[] = [
      ...new Set<string>(
        (items as any[])
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
    
    const processedItems = items.map((item: any) => {
      const qty = Number(item.qty) || 0;
      const variantId = item.variantId ? String(item.variantId) : "";
      const bs = variantId ? boxSpecByVariant.get(variantId) : undefined;
      const perUnitFromBox =
        bs?.boxLengthCm && bs?.boxWidthCm && bs?.boxHeightCm && bs?.qtyPerBox
          ? (Number(bs.boxLengthCm) * Number(bs.boxWidthCm) * Number(bs.boxHeightCm)) / 1000000 / Number(bs.qtyPerBox)
          : 0;
      const unitVolume = perUnitFromBox > 0 ? perUnitFromBox : (Number(item.unitVolumeCBM) || 0);
      const perUnitWeightFromBox =
        bs?.weightKg && bs?.qtyPerBox ? Number(bs.weightKg) / Number(bs.qtyPerBox) : 0;
      const unitWeight = perUnitWeightFromBox > 0 ? perUnitWeightFromBox : (Number(item.unitWeightKG) || 0);
      const itemVolume = unitVolume * qty;
      const itemWeight = unitWeight * qty;
      
      totalVolumeCBM += itemVolume;
      totalWeightKG += itemWeight;
      loadingProductQty += qty;
      
      return {
        variantId: item.variantId || null,
        sku: item.sku || "",
        skuName: item.skuName || null,
        spec: item.spec || null,
        qty: qty,
        unitVolumeCBM: unitVolume || null,
        unitWeightKG: unitWeight || null,
        totalVolumeCBM: itemVolume || null,
        totalWeightKG: itemWeight || null,
      };
    });

    // 计算建议柜型
    // 20GP: 33 CBM, 40GP: 67 CBM, 40HQ: 76 CBM
    let suggestedContainerType = "";
    if (totalVolumeCBM > 0) {
      if (totalVolumeCBM <= 33) {
        suggestedContainerType = "20GP";
      } else if (totalVolumeCBM <= 67) {
        suggestedContainerType = "40GP";
      } else {
        suggestedContainerType = "40HQ";
      }
    }

    const preRecord = await prisma.containerPreRecord.create({
      data: {
        name: body.name || null,
        status: "Draft",
        notes: body.notes || null,
        outboundBatchId: body.outboundBatchId || null,
        outboundOrderId: body.outboundOrderId || null,
        exporterId: body.exporterId || null,
        exporterName: body.exporterName || null,
        overseasCompanyId: body.overseasCompanyId || null,
        overseasCompanyName: body.overseasCompanyName || null,
        shippingMethod: body.shippingMethod || null,
        originPort: body.originPort || null,
        destinationPort: body.destinationPort || null,
        destinationCountry: body.destinationCountry || null,
        loadingProductQty: loadingProductQty || 0,
        loadingLocation: body.loadingLocation || null,
        formFilledAt: toDateOrNull(body.formFilledAt) ?? new Date(),
        loadingDate: toDateOrNull(body.loadingDate),
        shippingWarehouseId: body.shippingWarehouseId || null,
        shippingWarehouseName: body.shippingWarehouseName || null,
        loadingLogisticsCompany: body.loadingLogisticsCompany || null,
        warehouseId: body.warehouseId || null,
        warehouseName: body.warehouseName || null,
        platform: body.platform || null,
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        totalVolumeCBM: totalVolumeCBM || null,
        totalWeightKG: totalWeightKG || null,
        suggestedContainerType: suggestedContainerType || null,
        items: {
          create: processedItems,
        },
      } as any,
      include: {
        items: true,
      },
    });

    return NextResponse.json({
      id: preRecord.id,
      name: preRecord.name,
      status: preRecord.status,
      totalVolumeCBM: preRecord.totalVolumeCBM?.toString(),
      totalWeightKG: preRecord.totalWeightKG?.toString(),
      suggestedContainerType: preRecord.suggestedContainerType,
      createdAt: preRecord.createdAt.toISOString(),
    });
  } catch (error) {
    return serverError("创建预录单失败", error, { includeDetailsInDev: true });
  }
}
