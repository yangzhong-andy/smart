import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildOutboundBatchSkuPayload } from "@/lib/outbound-batch-serialize";
import { badRequest, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

type BatchLike = {
  id: string;
  batchNumber: string;
  status?: string | null;
  containerId?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  destinationCountry?: string | null;
  destinationPlatform?: string | null;
  destinationStoreId?: string | null;
  destinationStoreName?: string | null;
  shippingMethod?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  outboundBatchItems?: unknown[];
  outboundOrder?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const batchIds = Array.isArray(body?.batchIds)
      ? [...new Set((body.batchIds as unknown[]).map((id) => String(id).trim()).filter(Boolean))]
      : [];
    if (batchIds.length === 0) {
      return badRequest("请至少选择 1 个出库批次");
    }

    const containerNo = String(body.containerNo || "").trim();
    const containerType = String(body.containerType || "").trim();
    const shippingMethod = String(body.shippingMethod || "").trim().toUpperCase();
    const volumetricDivisor = Number(body.volumetricDivisor || 6000);
    if (!containerNo || !containerType || !shippingMethod) {
      return badRequest("请填写柜号、柜型、运输方式");
    }
    if (!Number.isFinite(volumetricDivisor) || volumetricDivisor <= 0) {
      return badRequest("体积重系数必须大于 0");
    }

    const containerExists = await prisma.container.findUnique({
      where: { containerNo },
      select: { id: true },
    });
    if (containerExists) {
      return badRequest("该柜号已存在");
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
      console.error("[direct-container] 回退查询（无 OutboundBatchItem 表？）:", e);
      const legacy = await prisma.outboundBatch.findMany({
        where: { id: { in: batchIds } },
        include: incLegacy as any,
      });
      rows = legacy.map((b: any) => ({ ...b, outboundBatchItems: [] }));
    }
    if (rows.length !== batchIds.length) {
      return badRequest("部分批次不存在，请刷新后重试");
    }
    const alreadyLoaded = rows.filter((r) => r.status === "已装柜" || !!r.containerId);
    if (alreadyLoaded.length > 0) {
      return badRequest(`批次已装柜，禁止二次装柜：${alreadyLoaded.map((r) => r.batchNumber).join("、")}`);
    }

    const batchMap = new Map(rows.map((r) => [r.id, r]));
    const orderedBatches = batchIds.map((id) => batchMap.get(id)).filter(Boolean) as BatchLike[];
    const firstBatch = orderedBatches[0];

    const skuOverrides = Array.isArray(body?.skuOverrides)
      ? (body.skuOverrides as Array<{
          sku?: string;
          qty?: number;
          unitVolumeCBM?: number;
          unitWeightKG?: number;
        }>)
      : [];
    let totalVolumeCBM = 0;
    let totalActualWeightKG = 0;
    let totalVolumetricWeightKG = 0;
    if (skuOverrides.length > 0) {
      for (const row of skuOverrides) {
        const qty = Number(row.qty || 0);
        const unitV = Number(row.unitVolumeCBM || 0);
        const unitW = Number(row.unitWeightKG || 0);
        if (qty <= 0) continue;
        totalVolumeCBM += unitV * qty;
        totalActualWeightKG += unitW * qty;
        // 体积重公式：长*宽*高/6000；换算到 CBM 后等价为 CBM * 1_000_000 / 6000
        totalVolumetricWeightKG += (unitV * qty * 1_000_000) / volumetricDivisor;
      }
    } else {
      for (const batch of orderedBatches) {
        const payload = buildOutboundBatchSkuPayload(batch as any);
        totalVolumeCBM += payload.totalVolumeCBM || 0;
        totalActualWeightKG += payload.totalWeightKG || 0;
        totalVolumetricWeightKG += ((payload.totalVolumeCBM || 0) * 1_000_000) / volumetricDivisor;
      }
    }
    const chargeableWeightKG = Math.max(totalActualWeightKG, totalVolumetricWeightKG);

    const container = await prisma.$transaction(async (tx) => {
      const c = await tx.container.create({
        data: {
          containerNo,
          containerType,
          shippingMethod: shippingMethod as any,
          shipCompany: body.shipCompany || body.loadingLogisticsCompany || null,
          vesselName: body.vesselName || null,
          voyageNo: body.voyageNo || null,
          originPort: body.originPort || firstBatch.portOfLoading || null,
          destinationPort: body.destinationPort || firstBatch.portOfDischarge || null,
          destinationCountry: body.destinationCountry || firstBatch.destinationCountry || null,
          loadingDate: body.loadingDate ? new Date(body.loadingDate) : null,
          // “装柜日期”与“实际开船”口径分离：此处仅接收明确传入的实际开船时间
          actualDeparture: body.actualDeparture ? new Date(body.actualDeparture) : null,
          etd: body.etd ? new Date(body.etd) : null,
          eta: body.eta ? new Date(body.eta) : null,
          status: "PLANNED",
          exporterId: body.exporterId || null,
          exporterName: body.exporterName || null,
          overseasCompanyId: body.overseasCompanyId || null,
          overseasCompanyName: body.overseasCompanyName || null,
          // 目的仓库必须显式传入，避免误用首批次的国内出库仓
          warehouseId: body.warehouseId || null,
          warehouseName: body.warehouseName || null,
          platform: body.platform || firstBatch.destinationPlatform || null,
          storeId: body.storeId || firstBatch.destinationStoreId || null,
          storeName: body.storeName || firstBatch.destinationStoreName || null,
          totalVolumeCBM: totalVolumeCBM || null,
          totalWeightKG: chargeableWeightKG || null,
        },
      });

      const now = new Date();
      await tx.outboundBatch.updateMany({
        where: { id: { in: orderedBatches.map((b) => b.id) } },
        data: {
          containerId: c.id,
          status: "已装柜",
          lastEvent: "已装柜",
          lastEventTime: now,
        },
      });

      return c;
    });

    return NextResponse.json({
      id: container.id,
      containerNo: container.containerNo,
      containerType: container.containerType,
      totalVolumeCBM: container.totalVolumeCBM?.toString(),
      totalWeightKG: container.totalWeightKG?.toString(),
      actualWeightKG: totalActualWeightKG.toFixed(2),
      volumetricWeightKG: totalVolumetricWeightKG.toFixed(2),
      chargeableWeightKG: chargeableWeightKG.toFixed(2),
      volumetricDivisor,
      outboundBatchIds: orderedBatches.map((b) => b.id),
      outboundBatchNumbers: orderedBatches.map((b) => b.batchNumber),
      createdAt: container.createdAt.toISOString(),
    });
  } catch (error) {
    return serverError("直接生成柜子失败", error, { includeDetailsInDev: true });
  }
}
