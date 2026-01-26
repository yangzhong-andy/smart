import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 获取单个支出申请
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const expenseRequest = await prisma.expenseRequest.findUnique({
      where: { id: params.id }
    });
    
    if (!expenseRequest) {
      return NextResponse.json(
        { error: 'Expense request not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      id: expenseRequest.id,
      uid: expenseRequest.uid || undefined,
      date: expenseRequest.date.toISOString().slice(0, 10),
      summary: expenseRequest.summary,
      category: expenseRequest.category,
      amount: Number(expenseRequest.amount),
      currency: expenseRequest.currency,
      businessNumber: expenseRequest.businessNumber || undefined,
      relatedId: expenseRequest.relatedId || undefined,
      remark: expenseRequest.remark || undefined,
      voucher: expenseRequest.voucher ? (expenseRequest.voucher.startsWith('[') ? JSON.parse(expenseRequest.voucher) : expenseRequest.voucher) : undefined,
      storeId: expenseRequest.storeId || undefined,
      storeName: expenseRequest.storeName || undefined,
      country: expenseRequest.country || undefined,
      departmentId: expenseRequest.departmentId || undefined,
      departmentName: expenseRequest.departmentName || undefined,
      status: expenseRequest.status,
      createdBy: expenseRequest.createdBy,
      createdAt: expenseRequest.createdAt.toISOString(),
      submittedAt: expenseRequest.submittedAt?.toISOString(),
      approvedBy: expenseRequest.approvedBy || undefined,
      approvedAt: expenseRequest.approvedAt?.toISOString(),
      rejectionReason: expenseRequest.rejectionReason || undefined,
      financeAccountId: expenseRequest.financeAccountId || undefined,
      financeAccountName: expenseRequest.financeAccountName || undefined,
      paidBy: expenseRequest.paidBy || undefined,
      paidAt: expenseRequest.paidAt?.toISOString(),
      paymentFlowId: expenseRequest.paymentFlowId || undefined,
      paymentVoucher: expenseRequest.paymentVoucher ? (expenseRequest.paymentVoucher.startsWith('[') ? JSON.parse(expenseRequest.paymentVoucher) : expenseRequest.paymentVoucher) : undefined,
      adAccountId: expenseRequest.adAccountId || undefined,
      rebateAmount: expenseRequest.rebateAmount ? Number(expenseRequest.rebateAmount) : undefined
    });
  } catch (error: any) {
    console.error('Error fetching expense request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense request', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新支出申请
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    
    const updateData: any = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.approvedBy !== undefined) updateData.approvedBy = body.approvedBy;
    if (body.approvedAt !== undefined) updateData.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
    if (body.rejectionReason !== undefined) updateData.rejectionReason = body.rejectionReason;
    if (body.financeAccountId !== undefined) updateData.financeAccountId = body.financeAccountId;
    if (body.financeAccountName !== undefined) updateData.financeAccountName = body.financeAccountName;
    if (body.paidBy !== undefined) updateData.paidBy = body.paidBy;
    if (body.paidAt !== undefined) updateData.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    if (body.paymentFlowId !== undefined) updateData.paymentFlowId = body.paymentFlowId;
    if (body.paymentVoucher !== undefined) {
      updateData.paymentVoucher = body.paymentVoucher 
        ? (Array.isArray(body.paymentVoucher) ? JSON.stringify(body.paymentVoucher) : body.paymentVoucher)
        : null;
    }
    
    const updated = await prisma.expenseRequest.update({
      where: { id: params.id },
      data: updateData
    });
    
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt?.toISOString(),
      paidBy: updated.paidBy,
      paidAt: updated.paidAt?.toISOString()
    });
  } catch (error: any) {
    console.error('Error updating expense request:', error);
    return NextResponse.json(
      { error: 'Failed to update expense request', details: error.message },
      { status: 500 }
    );
  }
}
