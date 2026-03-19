import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/container-pre-records
 * 获取预录单列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = Math.min(parseInt(searchParams.get("pageSize") || "20", 10) || 20, 50);

    const where: any = {};
    if (status) where.status = status;

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
      exporterId: r.exporterId,
      exporterName: r.exporterName,
      overseasCompanyId: r.overseasCompanyId,
      overseasCompanyName: r.overseasCompanyName,
      shippingMethod: r.shippingMethod,
      originPort: r.originPort,
      destinationPort: r.destinationPort,
      destinationCountry: r.destinationCountry,
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

    // 计算总体积和总重量
    let totalVolumeCBM = 0;
    let totalWeightKG = 0;
    
    const processedItems = items.map((item: any) => {
      const unitVolume = item.unitVolumeCBM || 0;
      const unitWeight = item.unitWeightKG || 0;
      const qty = item.qty || 0;
      const itemVolume = unitVolume * qty;
      const itemWeight = unitWeight * qty;
      
      totalVolumeCBM += itemVolume;
      totalWeightKG += itemWeight;
      
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
        exporterId: body.exporterId || null,
        exporterName: body.exporterName || null,
        overseasCompanyId: body.overseasCompanyId || null,
        overseasCompanyName: body.overseasCompanyName || null,
        shippingMethod: body.shippingMethod || null,
        originPort: body.originPort || null,
        destinationPort: body.destinationPort || null,
        destinationCountry: body.destinationCountry || null,
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
      },
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
