import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 按体积分摊：与 logistics-cost-allocation 保持一致
    const rows = await prisma.$queryRawUnsafe<Array<{
      sku: string; batchCount: number; totalQty: number; totalCost: number; avgCost: number;
    }>>(
      `WITH variant_vol AS (
        SELECT obi.sku, obi.qty, ob."containerId" as cid,
          (pv."lengthCm" * pv."widthCm" * pv."heightCm" / 1000000.0) * obi.qty as vol_cbm
        FROM "OutboundBatchItem" obi
        JOIN "OutboundBatch" ob ON ob.id = obi."outboundBatchId"
        LEFT JOIN "ProductVariant" pv ON pv.id = obi."variantId"
      ),
      container_cost AS (
        SELECT ob."containerId" as cid, SUM(lcost.amount) as total_cost
        FROM "LogisticsCost" lcost
        JOIN "OutboundBatch" ob ON ob.id = lcost."outboundBatchId"
        JOIN "LogisticsChannel" lc ON lc.id = lcost."logisticsChannelId"
        WHERE lc.id = $1
        GROUP BY ob."containerId"
      ),
      container_total_vol AS (
        SELECT cid, SUM(vol_cbm) as total_vol
        FROM variant_vol GROUP BY cid
      ),
      cost_alloc AS (
        SELECT vv.sku, vv.qty, vv.cid,
          CASE WHEN ctv.total_vol > 0 
            THEN cc.total_cost * vv.vol_cbm / ctv.total_vol
            ELSE 0 END as allocated
        FROM variant_vol vv
        JOIN container_total_vol ctv ON ctv.cid = vv.cid
        JOIN container_cost cc ON cc.cid = vv.cid
      )
      SELECT sku,
        COUNT(DISTINCT cid)::int as "batchCount",
        SUM(qty)::int as "totalQty",
        ROUND(SUM(allocated)::numeric, 2) as "totalCost",
        ROUND((SUM(allocated) / NULLIF(SUM(qty), 0))::numeric, 2) as "avgCost"
      FROM cost_alloc
      GROUP BY sku
      ORDER BY "totalQty" DESC`,
      params.id
    );

    return NextResponse.json({
      data: rows.map(r => ({
        sku: r.sku,
        batchCount: Number(r.batchCount),
        totalQty: Number(r.totalQty),
        totalCost: Math.round(Number(r.totalCost) * 100) / 100,
        avgCost: Number(r.avgCost),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch channel SKU stats' },
      { status: 500 }
    );
  }
}
