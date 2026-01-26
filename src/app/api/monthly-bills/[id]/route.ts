import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 根据 ID 获取月账单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bill = await prisma.monthlyBill.findUnique({
      where: { id: params.id },
    });

    if (!bill) {
      return NextResponse.json(
        { error: "Monthly bill not found" },
        { status: 404 }
      );
    }

    // 解析 JSON 字段
    return NextResponse.json({
      ...bill,
      consumptionIds: bill.consumptionIds
        ? JSON.parse(bill.consumptionIds)
        : [],
      rechargeIds: bill.rechargeIds ? JSON.parse(bill.rechargeIds) : [],
      paymentApplicationVoucher: bill.paymentApplicationVoucher
        ? JSON.parse(bill.paymentApplicationVoucher)
        : undefined,
      paymentVoucher: bill.paymentVoucher
        ? JSON.parse(bill.paymentVoucher)
        : undefined,
    });
  } catch (error) {
    console.error("Error fetching monthly bill:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly bill" },
      { status: 500 }
    );
  }
}

// PUT: 更新月账单
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    // 将数组字段转换为 JSON 字符串
    const consumptionIds = body.consumptionIds
      ? JSON.stringify(body.consumptionIds)
      : undefined;
    const rechargeIds = body.rechargeIds
      ? JSON.stringify(body.rechargeIds)
      : undefined;
    const paymentApplicationVoucher = body.paymentApplicationVoucher
      ? JSON.stringify(
          Array.isArray(body.paymentApplicationVoucher)
            ? body.paymentApplicationVoucher
            : [body.paymentApplicationVoucher]
        )
      : undefined;
    const paymentVoucher = body.paymentVoucher
      ? JSON.stringify(
          Array.isArray(body.paymentVoucher)
            ? body.paymentVoucher
            : [body.paymentVoucher]
        )
      : undefined;

    const updateData: any = {};
    if (body.uid !== undefined) updateData.uid = body.uid;
    if (body.month !== undefined) updateData.month = body.month;
    if (body.billCategory !== undefined)
      updateData.billCategory = body.billCategory;
    if (body.billType !== undefined) updateData.billType = body.billType;
    if (body.agencyId !== undefined) updateData.agencyId = body.agencyId;
    if (body.agencyName !== undefined) updateData.agencyName = body.agencyName;
    if (body.adAccountId !== undefined) updateData.adAccountId = body.adAccountId;
    if (body.accountName !== undefined) updateData.accountName = body.accountName;
    if (body.supplierId !== undefined) updateData.supplierId = body.supplierId;
    if (body.supplierName !== undefined)
      updateData.supplierName = body.supplierName;
    if (body.factoryId !== undefined) updateData.factoryId = body.factoryId;
    if (body.factoryName !== undefined) updateData.factoryName = body.factoryName;
    if (body.totalAmount !== undefined)
      updateData.totalAmount = body.totalAmount;
    if (body.currency !== undefined) updateData.currency = body.currency;
    if (body.rebateAmount !== undefined)
      updateData.rebateAmount = body.rebateAmount;
    if (body.netAmount !== undefined) updateData.netAmount = body.netAmount;
    if (consumptionIds !== undefined)
      updateData.consumptionIds = consumptionIds;
    if (rechargeIds !== undefined) updateData.rechargeIds = rechargeIds;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.createdBy !== undefined) updateData.createdBy = body.createdBy;
    if (body.submittedToFinanceAt !== undefined)
      updateData.submittedToFinanceAt = new Date(body.submittedToFinanceAt);
    if (paymentApplicationVoucher !== undefined)
      updateData.paymentApplicationVoucher = paymentApplicationVoucher;
    if (body.financeReviewedBy !== undefined)
      updateData.financeReviewedBy = body.financeReviewedBy;
    if (body.financeReviewedAt !== undefined)
      updateData.financeReviewedAt = new Date(body.financeReviewedAt);
    if (body.submittedAt !== undefined)
      updateData.submittedAt = new Date(body.submittedAt);
    if (body.approvedBy !== undefined) updateData.approvedBy = body.approvedBy;
    if (body.approvedAt !== undefined)
      updateData.approvedAt = new Date(body.approvedAt);
    if (body.cashierApprovedBy !== undefined)
      updateData.cashierApprovedBy = body.cashierApprovedBy;
    if (body.cashierApprovedAt !== undefined)
      updateData.cashierApprovedAt = new Date(body.cashierApprovedAt);
    if (body.rejectionReason !== undefined)
      updateData.rejectionReason = body.rejectionReason;
    if (body.paidBy !== undefined) updateData.paidBy = body.paidBy;
    if (body.paidAt !== undefined) updateData.paidAt = new Date(body.paidAt);
    if (body.paymentMethod !== undefined)
      updateData.paymentMethod = body.paymentMethod;
    if (body.paymentAccountId !== undefined)
      updateData.paymentAccountId = body.paymentAccountId;
    if (body.paymentAccountName !== undefined)
      updateData.paymentAccountName = body.paymentAccountName;
    if (paymentVoucher !== undefined) updateData.paymentVoucher = paymentVoucher;
    if (body.paymentFlowId !== undefined)
      updateData.paymentFlowId = body.paymentFlowId;
    if (body.paymentVoucherNumber !== undefined)
      updateData.paymentVoucherNumber = body.paymentVoucherNumber;
    if (body.paymentRemarks !== undefined)
      updateData.paymentRemarks = body.paymentRemarks;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const bill = await prisma.monthlyBill.update({
      where: { id: params.id },
      data: updateData,
    });

    // 解析 JSON 字段返回
    return NextResponse.json({
      ...bill,
      consumptionIds: bill.consumptionIds
        ? JSON.parse(bill.consumptionIds)
        : [],
      rechargeIds: bill.rechargeIds ? JSON.parse(bill.rechargeIds) : [],
      paymentApplicationVoucher: bill.paymentApplicationVoucher
        ? JSON.parse(bill.paymentApplicationVoucher)
        : undefined,
      paymentVoucher: bill.paymentVoucher
        ? JSON.parse(bill.paymentVoucher)
        : undefined,
    });
  } catch (error) {
    console.error("Error updating monthly bill:", error);
    return NextResponse.json(
      { error: "Failed to update monthly bill" },
      { status: 500 }
    );
  }
}
