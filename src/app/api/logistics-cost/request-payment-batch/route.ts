import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

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
 * POST /api/logistics-cost/request-payment-batch
 * 将同一个柜子的多笔物流费合并成一个支出申请（审批单）
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const costIds: string[] = body.costIds;

    if (!Array.isArray(costIds) || costIds.length === 0) {
      return NextResponse.json({ error: "缺少费用ID列表" }, { status: 400 });
    }

    // 查询所有费用记录（含物流渠道信息）
    const costs = await prisma.logisticsCost.findMany({
      where: { id: { in: costIds } },
      include: {
        outboundBatch: {
          select: { batchNumber: true, containerId: true }
        },
        logisticsChannel: {
          select: { name: true, contact: true, phone: true }
        }
      }
    });

    if (costs.length === 0) {
      return NextResponse.json({ error: "未找到费用记录" }, { status: 404 });
    }

    // 检查是否都已发起过付款
    const alreadyRequested = costs.filter(c => c.expenseRequestId);
    if (alreadyRequested.length > 0) {
      return NextResponse.json(
        { error: `${alreadyRequested.length} 笔费用已发起过付款，请勿重复操作` },
        { status: 400 }
      );
    }

    // 合并金额
    const totalAmount = costs.reduce((sum, c) => sum + Number(c.amount), 0);
    const currency = costs[0].currency || "CNY";

    // 获取柜子信息（取第一个非空的 containerId）
    const containerId = costs.find(c => c.outboundBatch?.containerId)?.outboundBatch?.containerId || null;
    const containerNo: string | null = body.containerNo || null;

    // 费用类型汇总
    const costTypeSet = new Set(costs.map(c => c.costType));
    const costTypes = Array.from(costTypeSet);
    const primaryCostType = costTypes.length === 1 ? costTypes[0] : costTypes.join("、");

    // 批次号汇总
    const batchNumbers = costs
      .map(c => c.outboundBatch?.batchNumber)
      .filter(Boolean);
    const batchNumberStr = batchNumbers.length > 0
      ? (batchNumbers.length === 1 ? batchNumbers[0] : `${batchNumbers[0]} 等${batchNumbers.length}个批次`)
      : "物流费用";

    // 分类（取第一个费用的映射）
    const category = COST_TYPE_TO_CATEGORY[costs[0].costType] || `物流/${costs[0].costType}`;

    // 合并备注
    const notesList = costs.map(c => c.notes).filter(Boolean);
    const remark = notesList.length > 0 ? notesList.join("；") : "";

    // 合并凭证（取第一个有凭证的）
    const voucher = costs.find(c => c.voucher)?.voucher || null;

    // 获取物流渠道信息作为收款人
    const channel = costs.find(c => c.logisticsChannel)?.logisticsChannel;
    const payeeName = channel?.contact
      ? `${channel.name}（${channel.contact}${channel.phone ? ` ${channel.phone}` : ""}）`
      : channel?.name || undefined;

    // 生成唯一业务ID
    const uid = `LC-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // 创建一个合并的支出申请
    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        date: new Date(),
        summary: containerNo
          ? `${primaryCostType} - ${containerNo} - ${batchNumberStr}`
          : `${primaryCostType} - ${batchNumberStr}`,
        category,
        amount: totalAmount,
        currency,
        businessNumber: batchNumbers[0] || null,
        containerId: containerId,
        containerNo: containerNo,
        payeeName: payeeName || null,
        remark: remark,
        voucher: voucher,
        status: "Pending_Approval",
        createdBy: session.user?.name || "当前用户",
        submittedAt: new Date(),
      }
    });

    // 更新所有物流费记录，关联到同一个支出申请
    await prisma.logisticsCost.updateMany({
      where: { id: { in: costIds } },
      data: {
        expenseRequestId: expenseRequest.id,
        paymentStatus: "审批中",
        containerId: containerId,
      }
    });

    // 清除缓存
    await clearCacheByPrefix("logistics-cost");
    await clearCacheByPrefix("expense-requests");

    return NextResponse.json({
      success: true,
      expenseRequestId: expenseRequest.id,
      uid,
      mergedCount: costs.length,
      totalAmount,
    });
  } catch (error: any) {
    console.error("[logistics-cost request-payment-batch]", error);
    return NextResponse.json(
      { error: error?.message || "发起付款失败" },
      { status: 500 }
    );
  }
}
