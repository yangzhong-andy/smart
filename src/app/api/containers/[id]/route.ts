import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, handlePrismaError, serverError } from "@/lib/api-response";
import { buildOutboundBatchSkuPayload } from "@/lib/outbound-batch-serialize";
import { clearCacheByPrefix } from '@/lib/redis';
import { syncProductVariantInventory } from "@/lib/inventory-sync";

export const dynamic = "force-dynamic";

function sanitizeContainerDisplayFields(c: {
  loadingDate: Date | null;
  actualDeparture: Date | null;
}) {
  const hasInvalidActualDeparture =
    !!c.loadingDate && !!c.actualDeparture && c.actualDeparture.getTime() < c.loadingDate.getTime();

  return {
    actualDeparture: hasInvalidActualDeparture ? null : c.actualDeparture,
  };
}

// GET /api/containers/[id] - 获取单个柜子详情（含出库批次）
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const container = await prisma.container.findUnique({
      where: { id },
      include: {
        outboundBatches: {
          include: {
            outboundOrder: {
              include: {
                items: { include: { variant: true } },
                variant: true,
              },
            },
            warehouse: true,
            outboundBatchItems: { include: { variant: true } },
          },
          orderBy: { shippedDate: "asc" },
        },
      },
    });

    // 获取该柜子的物流费用
    const logisticsCosts = await prisma.logisticsCost.findMany({
      where: {
        OR: [
          { containerId: id },
          { outboundBatch: { containerId: id } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!container) {
      return NextResponse.json({ error: "柜子不存在" }, { status: 404 });
    }

    const shipmentLines = new Map<string, {
      sku: string;
      skuName: string;
      qty: number;
      variantId: string | null;
    }>();
    for (const batch of container.outboundBatches) {
      const rawItems = batch.outboundBatchItems ?? [];
      const lines = rawItems.length > 0
        ? rawItems.map((line) => ({
            sku: line.sku,
            skuName: line.skuName ?? line.sku,
            qty: line.qty,
            variantId: line.variantId ?? null,
          }))
        : buildOutboundBatchSkuPayload(batch as any).skuLines.map((line) => ({
            sku: line.sku,
            skuName: line.skuName ?? line.sku,
            qty: line.qty,
            variantId: line.variantId ?? null,
          }));
      for (const line of lines) {
        const key = line.variantId || line.sku;
        const previous = shipmentLines.get(key);
        shipmentLines.set(key, previous
          ? { ...previous, qty: previous.qty + line.qty }
          : line);
      }
    }
    const shipmentLineRows = [...shipmentLines.values()];
    const shipmentVariantIds = shipmentLineRows
      .map((line) => line.variantId)
      .filter((value): value is string => Boolean(value));
    const shipmentBoxSpecs = shipmentVariantIds.length > 0
      ? await (prisma as any).boxSpec.findMany({
          where: { variantId: { in: shipmentVariantIds } },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          select: {
            variantId: true,
            boxLengthCm: true,
            boxWidthCm: true,
            boxHeightCm: true,
            qtyPerBox: true,
            weightKg: true,
          },
        })
      : [];
    const specsByVariant = new Map<string, any[]>();
    for (const spec of shipmentBoxSpecs) {
      const rows = specsByVariant.get(spec.variantId) ?? [];
      rows.push(spec);
      specsByVariant.set(spec.variantId, rows);
    }
    let cartonCount: number | null = 0;
    let cartonCountKnown = true;
    const cartonBreakdown: Array<{ sku: string; cartons: number | null; detail: string }> = [];
    for (const line of shipmentLineRows) {
      const specs = line.variantId ? (specsByVariant.get(line.variantId) ?? []) : [];
      if (specs.length === 1 && Number(specs[0].qtyPerBox) > 0 && line.qty % Number(specs[0].qtyPerBox) === 0) {
        const cartons = line.qty / Number(specs[0].qtyPerBox);
        cartonCount = (cartonCount ?? 0) + cartons;
        cartonBreakdown.push({ sku: line.sku, cartons, detail: `${cartons} 箱 × ${specs[0].qtyPerBox} 个` });
      } else {
        cartonCountKnown = false;
        cartonBreakdown.push({ sku: line.sku, cartons: null, detail: specs.length > 1 ? "多套箱规，待确认装箱分配" : "未录入箱规" });
      }
    }
    // When a SKU has multiple box specs, use the saved container totals to solve
    // the integer carton mix instead of guessing one box spec.
    if (!cartonCountKnown && shipmentLineRows.length === 1 && shipmentBoxSpecs.length === 2 && container.totalVolumeCBM && container.totalWeightKG) {
      const line = shipmentLineRows[0];
      const [a, b] = shipmentBoxSpecs;
      const targetQty = line.qty;
      const targetVolume = Number(container.totalVolumeCBM);
      const targetWeight = Number(container.totalWeightKG);
      for (let cartonsA = 0; cartonsA <= Math.ceil(targetQty / Number(a.qtyPerBox)); cartonsA += 1) {
        const remaining = targetQty - cartonsA * Number(a.qtyPerBox);
        if (remaining < 0 || remaining % Number(b.qtyPerBox) !== 0) continue;
        const cartonsB = remaining / Number(b.qtyPerBox);
        const volume = cartonsA * Number(a.boxLengthCm) * Number(a.boxWidthCm) * Number(a.boxHeightCm) / 1_000_000
          + cartonsB * Number(b.boxLengthCm) * Number(b.boxWidthCm) * Number(b.boxHeightCm) / 1_000_000;
        const weight = cartonsA * Number(a.weightKg) + cartonsB * Number(b.weightKg);
        if (Math.abs(volume - targetVolume) < 0.002 && Math.abs(weight - targetWeight) < 0.02) {
          cartonCount = cartonsA + cartonsB;
          cartonCountKnown = true;
          cartonBreakdown[0] = {
            sku: line.sku,
            cartons: cartonCount,
            detail: `${cartonsA} 箱 × ${a.qtyPerBox} 个 + ${cartonsB} 箱 × ${b.qtyPerBox} 个`,
          };
          break;
        }
      }
    }

    const sanitized = sanitizeContainerDisplayFields({
      loadingDate: container.loadingDate,
      actualDeparture: container.actualDeparture,
    });

    await clearCacheByPrefix('containers');
    return NextResponse.json({
      id: container.id,
      containerNo: container.containerNo,
      containerType: container.containerType,
      sealNo: container.sealNo ?? undefined,
      shippingMethod: container.shippingMethod,
      shipCompany: container.shipCompany ?? undefined,
      vesselName: container.vesselName ?? undefined,
      voyageNo: container.voyageNo ?? undefined,
      originPort: container.originPort ?? undefined,
      destinationPort: container.destinationPort ?? undefined,
      destinationCountry: container.destinationCountry ?? undefined,
      loadingDate: container.loadingDate?.toISOString() ?? undefined,
      etd: container.etd?.toISOString() ?? undefined,
      eta: container.eta?.toISOString() ?? undefined,
      actualDeparture: sanitized.actualDeparture?.toISOString() ?? undefined,
      actualArrival: container.actualArrival?.toISOString() ?? undefined,
      customsClearanceAt: container.customsClearanceAt?.toISOString() ?? undefined,
      warehouseInboundAt: container.warehouseInboundAt?.toISOString() ?? undefined,
      status: container.status,
      // 出口模式
      exportMode: container.exportMode ?? undefined,
      serviceMode: container.serviceMode ?? undefined,
      // 主体
      exporterId: container.exporterId ?? undefined,
      exporterName: container.exporterName ?? undefined,
      overseasCompanyId: container.overseasCompanyId ?? undefined,
      overseasCompanyName: container.overseasCompanyName ?? undefined,
      // 申报
      declaredValue: container.declaredValue ? container.declaredValue.toString() : undefined,
      declaredCurrency: container.declaredCurrency ?? undefined,
      // 关税
      dutyAmount: container.dutyAmount ? container.dutyAmount.toString() : undefined,
      dutyPayer: container.dutyPayer ?? undefined,
      dutyCurrency: container.dutyCurrency ?? undefined,
      dutyPaidAmount: container.dutyPaidAmount ? container.dutyPaidAmount.toString() : undefined,
      // 回款
      returnAmount: container.returnAmount ? container.returnAmount.toString() : undefined,
      returnDate: container.returnDate?.toISOString() ?? undefined,
      returnCurrency: container.returnCurrency ?? undefined,
      // 仓库
      warehouseId: container.warehouseId ?? undefined,
      warehouseName: container.warehouseName ?? undefined,
      // 销售
      platform: container.platform ?? undefined,
      storeId: container.storeId ?? undefined,
      storeName: container.storeName ?? undefined,
      // 汇总
      totalVolumeCBM: container.totalVolumeCBM ? container.totalVolumeCBM.toString() : undefined,
      totalWeightKG: container.totalWeightKG ? container.totalWeightKG.toString() : undefined,
      shipmentSummary: {
        batchCount: container.outboundBatches.length,
        totalPieces: shipmentLineRows.reduce((sum, line) => sum + line.qty, 0),
        skuCount: shipmentLineRows.length,
        cartonCount: cartonCountKnown ? cartonCount : null,
        cartonCountKnown,
        cartonBreakdown,
        lines: shipmentLineRows.map((line) => ({
          sku: line.sku,
          skuName: line.skuName,
          qty: line.qty,
          variantId: line.variantId,
        })),
      },
      createdAt: container.createdAt.toISOString(),
      updatedAt: container.updatedAt.toISOString(),
      outboundBatches: container.outboundBatches.map((b) => ({
        id: b.id,
        batchNumber: b.batchNumber,
        qty: b.qty,
        shippedDate: b.shippedDate.toISOString(),
        status: b.status,
        // 批次级运输/追踪（出库后维护，便于在「柜子详情」看本柜在途情况）
        shippingMethod: b.shippingMethod ?? undefined,
        trackingNumber: b.trackingNumber ?? undefined,
        vesselName: b.vesselName ?? undefined,
        vesselVoyage: b.vesselVoyage ?? undefined,
        portOfLoading: b.portOfLoading ?? undefined,
        portOfDischarge: b.portOfDischarge ?? undefined,
        eta: b.eta?.toISOString() ?? undefined,
        actualDepartureDate: b.actualDepartureDate?.toISOString() ?? undefined,
        actualArrivalDate: b.actualArrivalDate?.toISOString() ?? undefined,
        destinationCountry: b.destinationCountry ?? undefined,
        destinationPlatform: b.destinationPlatform ?? undefined,
        destinationStoreName: b.destinationStoreName ?? undefined,
        ownerName: b.ownerName ?? undefined,
        currentLocation: b.currentLocation ?? undefined,
        lastEvent: b.lastEvent ?? undefined,
        lastEventTime: b.lastEventTime?.toISOString() ?? undefined,
        warehouse: b.warehouse
          ? {
              id: b.warehouse.id,
              name: b.warehouse.name,
            }
          : undefined,
        outboundOrder: b.outboundOrder
          ? {
              id: b.outboundOrder.id,
              outboundNumber: b.outboundOrder.outboundNumber,
              sku: b.outboundOrder.sku,
            }
          : undefined,
        ...(() => {
          const rawItems = b.outboundBatchItems ?? [];
          if (rawItems.length > 0) {
            return {
              skuLines: rawItems.map((line) => ({
                id: line.id,
                variantId: line.variantId ?? undefined,
                sku: line.sku,
                skuName: line.skuName ?? undefined,
                spec: line.spec ?? undefined,
                qty: line.qty,
              })),
              skuLinesEstimated: false,
              skuLinesNote: undefined as string | undefined,
            };
          }
          const payload = buildOutboundBatchSkuPayload(b as any);
          return {
            skuLines: payload.skuLines.map((l, i) => ({
              id: l.id ?? `ref-${b.id}-${i}`,
              variantId: l.variantId ?? undefined,
              sku: l.sku,
              skuName: l.skuName ?? undefined,
              spec: l.spec ?? undefined,
              qty: l.qty,
            })),
            skuLinesEstimated: payload.skuLinesEstimated,
            skuLinesNote: payload.skuLinesNote,
          };
        })(),
      })),
      logisticsCosts: logisticsCosts.map((c) => ({
        id: c.id,
        costType: c.costType,
        amount: Number(c.amount),
        currency: c.currency,
        paymentStatus: c.paymentStatus,
        paymentType: c.paymentType,
        dueDate: c.dueDate?.toISOString() || null,
        paidDate: c.paidDate?.toISOString() || null,
        expenseRequestId: c.expenseRequestId || null,
        notes: c.notes || null,
      })),
    });
  } catch (error) {
    return serverError("获取柜子详情失败", error, { includeDetailsInDev: true });
  }
}

// PUT /api/containers/[id] - 更新柜子信息（状态、时间等）
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const data: any = {};

    if (body.containerNo != null) data.containerNo = String(body.containerNo).trim();
    if (body.containerType != null) data.containerType = String(body.containerType).trim();
    if (body.sealNo !== undefined) data.sealNo = body.sealNo || null;
    if (body.shippingMethod) data.shippingMethod = body.shippingMethod;
    if (body.shipCompany !== undefined) data.shipCompany = body.shipCompany || null;
    if (body.vesselName !== undefined) data.vesselName = body.vesselName || null;
    if (body.voyageNo !== undefined) data.voyageNo = body.voyageNo || null;
    if (body.originPort !== undefined) data.originPort = body.originPort || null;
    if (body.destinationPort !== undefined) data.destinationPort = body.destinationPort || null;
    if (body.destinationCountry !== undefined) data.destinationCountry = body.destinationCountry || null;
    if (body.loadingDate !== undefined) data.loadingDate = body.loadingDate ? new Date(body.loadingDate) : null;
    if (body.etd !== undefined) data.etd = body.etd ? new Date(body.etd) : null;
    if (body.eta !== undefined) data.eta = body.eta ? new Date(body.eta) : null;
    if (body.actualDeparture !== undefined)
      data.actualDeparture = body.actualDeparture ? new Date(body.actualDeparture) : null;
    if (body.actualArrival !== undefined)
      data.actualArrival = body.actualArrival ? new Date(body.actualArrival) : null;
    if (body.customsClearanceAt !== undefined)
      data.customsClearanceAt = body.customsClearanceAt ? new Date(body.customsClearanceAt) : null;
    if (body.warehouseInboundAt !== undefined)
      data.warehouseInboundAt = body.warehouseInboundAt ? new Date(body.warehouseInboundAt) : null;
    if (body.status) data.status = body.status;
    // 出口模式
    if (body.exportMode !== undefined) data.exportMode = body.exportMode || null;
    if (body.serviceMode !== undefined) data.serviceMode = body.serviceMode || null;
    // 主体
    if (body.exporterId !== undefined) data.exporterId = body.exporterId || null;
    if (body.exporterName !== undefined) data.exporterName = body.exporterName || null;
    if (body.overseasCompanyId !== undefined) data.overseasCompanyId = body.overseasCompanyId || null;
    if (body.overseasCompanyName !== undefined) data.overseasCompanyName = body.overseasCompanyName || null;
    // 申报
    if (body.declaredValue !== undefined)
      data.declaredValue = body.declaredValue != null ? Number(body.declaredValue) : null;
    if (body.declaredCurrency !== undefined) data.declaredCurrency = body.declaredCurrency || null;
    // 关税
    if (body.dutyAmount !== undefined)
      data.dutyAmount = body.dutyAmount != null ? Number(body.dutyAmount) : null;
    if (body.dutyPayer !== undefined) data.dutyPayer = body.dutyPayer || null;
    if (body.dutyCurrency !== undefined) data.dutyCurrency = body.dutyCurrency || null;
    if (body.dutyPaidAmount !== undefined)
      data.dutyPaidAmount = body.dutyPaidAmount != null ? Number(body.dutyPaidAmount) : null;
    // 回款
    if (body.returnAmount !== undefined)
      data.returnAmount = body.returnAmount != null ? Number(body.returnAmount) : null;
    if (body.returnDate !== undefined)
      data.returnDate = body.returnDate ? new Date(body.returnDate) : null;
    if (body.returnCurrency !== undefined) data.returnCurrency = body.returnCurrency || null;
    // 仓库
    if (body.warehouseId !== undefined) data.warehouseId = body.warehouseId || null;
    if (body.warehouseName !== undefined) data.warehouseName = body.warehouseName || null;
    // 销售
    if (body.platform !== undefined) data.platform = body.platform || null;
    if (body.storeId !== undefined) data.storeId = body.storeId || null;
    if (body.storeName !== undefined) data.storeName = body.storeName || null;
    // 汇总
    if (body.totalVolumeCBM !== undefined)
      data.totalVolumeCBM = body.totalVolumeCBM != null ? Number(body.totalVolumeCBM) : null;
    if (body.totalWeightKG !== undefined)
      data.totalWeightKG = body.totalWeightKG != null ? Number(body.totalWeightKG) : null;

    if (Object.keys(data).length === 0) {
      return badRequest("没有可更新的字段");
    }

    const updated = await prisma.container.update({
      where: { id },
      data,
    });

    // 柜子状态决定货物是否进入/离开在途。状态或关键运输时间更新后，
    // 立即刷新受影响 SKU 的缓存字段，避免产品档案与实时资产总账出现两个数字。
    if (body.status !== undefined || body.actualDeparture !== undefined || body.actualArrival !== undefined || body.warehouseInboundAt !== undefined) {
      const affected = await prisma.outboundBatchItem.findMany({
        where: { outboundBatch: { containerId: id }, variantId: { not: null } },
        select: { variantId: true },
        distinct: ["variantId"],
      });
      await Promise.all(
        affected
          .map((row) => row.variantId)
          .filter((variantId): variantId is string => Boolean(variantId))
          .map((variantId) => syncProductVariantInventory(variantId)),
      );
    }

    await clearCacheByPrefix('containers');
    return NextResponse.json({
      id: updated.id,
      updatedAt: updated.updatedAt.toISOString(),
      status: updated.status,
    });
  } catch (error) {
    return handlePrismaError(error, {
      notFoundMessage: "柜子不存在",
      serverMessage: "更新柜子失败",
    });
  }
}
