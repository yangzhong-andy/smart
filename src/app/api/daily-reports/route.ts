import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

const CACHE_KEY_PREFIX = "daily-reports";

// GET - 获取报表列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "100");
    const storeId = searchParams.get("storeId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const noCache = searchParams.get("noCache") === "true";

    const where: any = {};
    if (storeId) where.storeId = storeId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [reports, total] = await Promise.all([
      prisma.dailyOperationReport.findMany({
        where,
        orderBy: { date: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dailyOperationReport.count({ where }),
    ]);

    return NextResponse.json({
      data: reports.map((r) => ({
        ...r,
        date: r.date.toISOString().split("T")[0],
        gmv: r.gmv ? Number(r.gmv) : null,
        adCost: r.adCost ? Number(r.adCost) : null,
        totalCost: r.totalCost ? Number(r.totalCost) : null,
        grossProfit: r.grossProfit ? Number(r.grossProfit) : null,
        estProfit: r.estProfit ? Number(r.estProfit) : null,
        influGmv: r.influGmv ? Number(r.influGmv) : null,
        selfVideoGmv: r.selfVideoGmv ? Number(r.selfVideoGmv) : null,
        productCardGmv: r.productCardGmv ? Number(r.productCardGmv) : null,
        liveGmv: r.liveGmv ? Number(r.liveGmv) : null,
        influCommission: r.influCommission ? Number(r.influCommission) : null,
        refundAmount: r.refundAmount ? Number(r.refundAmount) : null,
        totalPromoCost: r.totalPromoCost ? Number(r.totalPromoCost) : null,
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取失败" }, { status: 500 });
  }
}

// POST - 创建报表
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.date) {
      return NextResponse.json({ error: "请提供日期" }, { status: 400 });
    }

    // 检查是否已存在
    const existing = await prisma.dailyOperationReport.findUnique({
      where: { date: new Date(body.date) },
    });
    if (existing) {
      return NextResponse.json({ error: "该日期的报表已存在" }, { status: 400 });
    }

    const report = await prisma.dailyOperationReport.create({
      data: {
        date: new Date(body.date),
        month: body.month || null,
        storeId: body.storeId || null,
        operations: body.operations || null,
        gmv: body.gmv ? Number(body.gmv) : null,
        totalQty: body.totalQty ? Number(body.totalQty) : null,
        orderCount: body.orderCount ? Number(body.orderCount) : null,
        avgOrderQty: body.avgOrderQty ? Number(body.avgOrderQty) : null,
        set3Qty: body.set3Qty ? Number(body.set3Qty) : null,
        set3Ratio: body.set3Ratio ? Number(body.set3Ratio) : null,
        set1Qty: body.set1Qty ? Number(body.set1Qty) : null,
        set1Ratio: body.set1Ratio ? Number(body.set1Ratio) : null,
        rechargeQty: body.rechargeQty ? Number(body.rechargeQty) : null,
        rechargeRatio: body.rechargeRatio ? Number(body.rechargeRatio) : null,
        avgPriceRange: body.avgPriceRange || null,
        price: body.price || null,
        selfVideoCount: body.selfVideoCount ? Number(body.selfVideoCount) : null,
        influVideoCount: body.influVideoCount ? Number(body.influVideoCount) : null,
        targetRoi: body.targetRoi ? Number(body.targetRoi) : null,
        adCost: body.adCost ? Number(body.adCost) : null,
        costPerOrder: body.costPerOrder ? Number(body.costPerOrder) : null,
        actualRoi: body.actualRoi ? Number(body.actualRoi) : null,
        tr: body.tr || null,
        totalCost: body.totalCost ? Number(body.totalCost) : null,
        grossProfit: body.grossProfit ? Number(body.grossProfit) : null,
        profitMargin: body.profitMargin ? Number(body.profitMargin) : null,
        refundAmount: body.refundAmount ? Number(body.refundAmount) : null,
        extraCost: body.extraCost || null,
        totalPromoCost: body.totalPromoCost ? Number(body.totalPromoCost) : null,
        estProfitRate: body.estProfitRate ? Number(body.estProfitRate) : null,
        estProfit: body.estProfit ? Number(body.estProfit) : null,
        influGmv: body.influGmv ? Number(body.influGmv) : null,
        influOrders: body.influOrders ? Number(body.influOrders) : null,
        videoExposure: body.videoExposure ? Number(body.videoExposure) : null,
        videoClicks: body.videoClicks ? Number(body.videoClicks) : null,
        videoClickRate: body.videoClickRate ? Number(body.videoClickRate) : null,
        videoConvRate: body.videoConvRate ? Number(body.videoConvRate) : null,
        influCommission: body.influCommission ? Number(body.influCommission) : null,
        influAdCommission: body.influAdCommission ? Number(body.influAdCommission) : null,
        agencyCommission: body.agencyCommission ? Number(body.agencyCommission) : null,
        agencyAdCommission: body.agencyAdCommission ? Number(body.agencyAdCommission) : null,
        influCommissionRate: body.influCommissionRate ? Number(body.influCommissionRate) : null,
        influRatio: body.influRatio ? Number(body.influRatio) : null,
        agencyCommissionRate: body.agencyCommissionRate ? Number(body.agencyCommissionRate) : null,
        totalCommissionRate: body.totalCommissionRate ? Number(body.totalCommissionRate) : null,
        selfVideoGmv: body.selfVideoGmv ? Number(body.selfVideoGmv) : null,
        selfVideoOrders: body.selfVideoOrders ? Number(body.selfVideoOrders) : null,
        selfVideoExposure: body.selfVideoExposure ? Number(body.selfVideoExposure) : null,
        selfVideoClicks: body.selfVideoClicks ? Number(body.selfVideoClicks) : null,
        selfVideoClickRate: body.selfVideoClickRate ? Number(body.selfVideoClickRate) : null,
        selfVideoConvRate: body.selfVideoConvRate ? Number(body.selfVideoConvRate) : null,
        selfVideoRatio: body.selfVideoRatio ? Number(body.selfVideoRatio) : null,
        productCardGmv: body.productCardGmv ? Number(body.productCardGmv) : null,
        productCardExposure: body.productCardExposure ? Number(body.productCardExposure) : null,
        productCardConvRate: body.productCardConvRate ? Number(body.productCardConvRate) : null,
        productCardRatio: body.productCardRatio ? Number(body.productCardRatio) : null,
        warehouseStock: body.warehouseStock ? Number(body.warehouseStock) : null,
        transitStock: body.transitStock ? Number(body.transitStock) : null,
        saleableDays: body.saleableDays ? Number(body.saleableDays) : null,
        liveGmv: body.liveGmv ? Number(body.liveGmv) : null,
        liveExposure: body.liveExposure ? Number(body.liveExposure) : null,
        liveConvRate: body.liveConvRate ? Number(body.liveConvRate) : null,
        liveRatio: body.liveRatio ? Number(body.liveRatio) : null,
        notes: body.notes || null,
      },
    });

    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: report.id,
      date: report.date.toISOString().split("T")[0],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建失败" }, { status: 500 });
  }
}
