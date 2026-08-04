import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

// 费用类型到支出分类的映射
const COST_TYPE_TO_CATEGORY: Record<string, string> = {
  "海运费": "物流/海运费用",
  "海运费（双清包税）": "物流/海运费用",
  "空运费": "物流/空运费用",
  "港杂费": "物流/其他物流费用",
  "清关费": "物流/其他物流费用",
  "送货费": "物流/国内物流",
  "快递费": "物流/快递费用",
  "仓储费": "物流/仓储费用",
};

/**
 * POST /api/logistics-cost/[id]/request-payment
 * 为物流费创建支出申请，进入审批付款流程
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { id } = await params;
    const cost = await prisma.logisticsCost.findUnique({
      where: { id },
      include: {
        outboundBatch: {
          select: { batchNumber: true, containerId: true }
        }
      }
    });

    if (!cost) {
      return NextResponse.json({ error: "物流费记录不存在" }, { status: 404 });
    }

    if (cost.expenseRequestId) {
      return NextResponse.json({ error: "已发起付款申请，请勿重复操作" }, { status: 400 });
    }

    // 映射费用类型到分类
    const category = COST_TYPE_TO_CATEGORY[cost.costType] || `物流/${cost.costType}`;

    // 生成唯一业务ID
    const uid = `LC-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // 创建支出申请
    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        date: new Date(),
        summary: `${cost.costType} - ${cost.outboundBatch?.batchNumber || "物流费用"}`,
        category,
        amount: cost.amount,
        currency: cost.currency,
        businessNumber: cost.outboundBatch?.batchNumber || null,
        containerId: cost.outboundBatch?.containerId || null,
        remark: cost.notes || "",
        voucher: cost.voucher || null,
        status: "Pending_Approval",
        createdBy: session.user?.name || "当前用户",
        submittedAt: new Date(),
      }
    });

    // 更新物流费记录
    await prisma.logisticsCost.update({
      where: { id },
      data: {
        uid,
        expenseRequestId: expenseRequest.id,
        paymentStatus: "审批中",
        containerId: cost.outboundBatch?.containerId || null,
      }
    });

    return NextResponse.json({
      success: true,
      expenseRequestId: expenseRequest.id,
      uid,
    });
  } catch (error: any) {
    console.error("[logistics-cost request-payment]", error);
    return NextResponse.json(
      { error: error?.message || "发起付款失败" },
      { status: 500 }
    );
  }
}
