import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 获取所有月账单或按状态筛选
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where = status ? { status } : {};

    const bills = await prisma.monthlyBill.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // 解析 JSON 字段
    const billsWithParsedFields = bills.map((bill) => ({
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
    }));

    return NextResponse.json(billsWithParsedFields);
  } catch (error) {
    console.error("Error fetching monthly bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly bills" },
      { status: 500 }
    );
  }
}

// POST: 创建新的月账单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 将数组字段转换为 JSON 字符串
    const consumptionIds = body.consumptionIds
      ? JSON.stringify(body.consumptionIds)
      : null;
    const rechargeIds = body.rechargeIds
      ? JSON.stringify(body.rechargeIds)
      : null;
    const paymentApplicationVoucher = body.paymentApplicationVoucher
      ? JSON.stringify(
          Array.isArray(body.paymentApplicationVoucher)
            ? body.paymentApplicationVoucher
            : [body.paymentApplicationVoucher]
        )
      : null;
    const paymentVoucher = body.paymentVoucher
      ? JSON.stringify(
          Array.isArray(body.paymentVoucher)
            ? body.paymentVoucher
            : [body.paymentVoucher]
        )
      : null;

    const bill = await prisma.monthlyBill.create({
      data: {
        uid: body.uid,
        month: body.month,
        billCategory: body.billCategory,
        billType: body.billType,
        agencyId: body.agencyId,
        agencyName: body.agencyName,
        adAccountId: body.adAccountId,
        accountName: body.accountName,
        supplierId: body.supplierId,
        supplierName: body.supplierName,
        factoryId: body.factoryId,
        factoryName: body.factoryName,
        totalAmount: body.totalAmount,
        currency: body.currency || "CNY",
        rebateAmount: body.rebateAmount || 0,
        netAmount: body.netAmount,
        consumptionIds,
        rechargeIds,
        status: body.status || "Draft",
        createdBy: body.createdBy,
        submittedToFinanceAt: body.submittedToFinanceAt
          ? new Date(body.submittedToFinanceAt)
          : null,
        paymentApplicationVoucher,
        financeReviewedBy: body.financeReviewedBy,
        financeReviewedAt: body.financeReviewedAt
          ? new Date(body.financeReviewedAt)
          : null,
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
        approvedBy: body.approvedBy,
        approvedAt: body.approvedAt ? new Date(body.approvedAt) : null,
        cashierApprovedBy: body.cashierApprovedBy,
        cashierApprovedAt: body.cashierApprovedAt
          ? new Date(body.cashierApprovedAt)
          : null,
        rejectionReason: body.rejectionReason,
        paidBy: body.paidBy,
        paidAt: body.paidAt ? new Date(body.paidAt) : null,
        paymentMethod: body.paymentMethod,
        paymentAccountId: body.paymentAccountId,
        paymentAccountName: body.paymentAccountName,
        paymentVoucher,
        paymentFlowId: body.paymentFlowId,
        paymentVoucherNumber: body.paymentVoucherNumber,
        paymentRemarks: body.paymentRemarks,
        notes: body.notes,
      },
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
    console.error("Error creating monthly bill:", error);
    return NextResponse.json(
      { error: "Failed to create monthly bill" },
      { status: 500 }
    );
  }
}
