import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-contracts/by-number?contractNumber=xxx
 * 按采购合同编号查询 contractId（便于修复/定位）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contractNumber = (searchParams.get("contractNumber") || "").trim();
    if (!contractNumber) {
      return NextResponse.json({ error: "缺少 contractNumber" }, { status: 400 });
    }

    const contract = await prisma.purchaseContract.findUnique({
      where: { contractNumber },
      select: { id: true, contractNumber: true, createdAt: true },
    });

    if (!contract) {
      return NextResponse.json({ error: "未找到该采购合同" }, { status: 404 });
    }

    return NextResponse.json({
      id: contract.id,
      contractNumber: contract.contractNumber,
      createdAt: contract.createdAt.toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "查询失败" }, { status: 500 });
  }
}

