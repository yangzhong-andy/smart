import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function truncate(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.trunc((value + (value >= 0 ? 1e-9 : -1e-9)) * factor) / factor;
}

/**
 * GET /api/logistics-cost-allocation
 * 按柜子汇总物流费，并按产品体积分摊到每个SKU
 * 
 * ?containerId=xxx  — 指定柜子
 * 无参数时返回所有柜子汇总
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const containerId = searchParams.get("containerId");

    // 查询物流费 + 关联的批次和产品
    const costs = await prisma.logisticsCost.findMany({
      where: containerId ? { containerId } : { containerId: { not: null } },
      include: {
        outboundBatch: {
          include: {
            outboundBatchItems: {
              select: {
                variantId: true,
                sku: true,
                qty: true,
                variant: {
                  select: {
                    id: true,
                    lengthCm: true,
                    widthCm: true,
                    heightCm: true,
                    volumetricDivisor: true,
                  },
                },
              },
            },
            container: { select: { id: true, containerNo: true, totalVolumeCBM: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (costs.length === 0) {
      return NextResponse.json({ data: [], summary: { totalCost: 0, totalVolume: 0 } });
    }

    // 按柜子+费用类型分组（多个批次可能属于同一柜子同一费用类型）
    const containerGroups = new Map<string, {
      containerNo: string;
      totalVolumeCBM: number;
      totalCost: number;
      currency: string;
      costType: string;
      items: Map<string, { sku: string; qty: number; length: number; width: number; height: number; divisor: number }>;
    }>();

    for (const cost of costs) {
      const container = cost.outboundBatch?.container;
      if (!container) continue;

      const key = `${container.id}_${cost.costType}`;
      if (!containerGroups.has(key)) {
        containerGroups.set(key, {
          containerNo: container.containerNo,
          totalVolumeCBM: Number(container.totalVolumeCBM) || 0,
          totalCost: 0,
          currency: cost.currency,
          costType: cost.costType,
          items: new Map(),
        });
      }

      const group = containerGroups.get(key)!;
      group.totalCost += Number(cost.amount);

      // 收集该批次内的所有产品
      const items = (cost.outboundBatch as any)?.outboundBatchItems || [];
      for (const item of items) {
        const v = item.variant;
        const key = item.sku || (v?.id || 'unknown');
        if (!group.items.has(key)) {
          group.items.set(key, {
            sku: item.sku || '未知',
            qty: 0,
            length: Number(v?.lengthCm) || 0,
            width: Number(v?.widthCm) || 0,
            height: Number(v?.heightCm) || 0,
            divisor: Number(v?.volumetricDivisor) || 6000,
          });
        }
        group.items.get(key)!.qty += item.qty || 0;
      }
    }

    // 计算分摊
    const result: any[] = [];

    for (const [, group] of containerGroups) {
      // 计算每个变体的单位体积（m³）和总体积
      const variantVolumes: { variantId: string; sku: string; qty: number; unitVolCBM: number; totalVolCBM: number }[] = [];
      let totalProductVolume = 0;

      for (const [variantId, info] of group.items) {
        // 单位体积 m³ = (长cm × 宽cm × 高cm) / 1,000,000
        const unitVolCBM = (info.length * info.width * info.height) / 1_000_000;
        const totalVol = unitVolCBM * info.qty;
        variantVolumes.push({
          variantId,
          sku: info.sku,
          qty: info.qty,
          unitVolCBM,
          totalVolCBM: totalVol,
        });
        totalProductVolume += totalVol;
      }

      // 按体积占比分摊费用
      for (const vv of variantVolumes) {
        const ratio = totalProductVolume > 0 ? vv.totalVolCBM / totalProductVolume : 0;
        const allocatedCost = group.totalCost * ratio;
        const unitCost = vv.qty > 0 ? allocatedCost / vv.qty : 0;

        result.push({
          containerNo: group.containerNo,
          costType: group.costType,
          totalContainerCost: group.totalCost,
          containerVolumeCBM: group.totalVolumeCBM,
          currency: group.currency,
          sku: vv.sku,
          qty: vv.qty,
          unitVolCBM: truncate(vv.unitVolCBM, 6),
          totalVolCBM: truncate(vv.totalVolCBM, 6),
          volumeRatio: truncate(ratio * 100, 2),
          allocatedCost: truncate(allocatedCost),
          unitCost: truncate(unitCost),
        });
      }
    }

    // 排序
    result.sort((a, b) => b.containerNo.localeCompare(a.containerNo) || b.allocatedCost - a.allocatedCost);

    const totalCost = result.reduce((s, r) => s + r.allocatedCost, 0);

    return NextResponse.json({
      data: result,
      summary: {
        totalCost: truncate(totalCost),
        containerCount: containerGroups.size,
        skuCount: new Set(result.map(r => r.sku)).size,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "计算失败" }, { status: 500 });
  }
}
