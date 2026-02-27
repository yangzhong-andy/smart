import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

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

    // 当支出申请被标记为「已支付」且为采购合同定金时，同步更新合同的财务状态
    const isDepositPaid = body.status === 'Paid' && updated.summary && updated.summary.includes('采购合同定金');
    if (isDepositPaid) {
      const contractNumber = (updated.summary
        .replace(/^采购合同定金\s*[-\－:：]\s*/i, '')
        .trim() || updated.summary.replace('采购合同定金', '').trim());
      const amount = Number(updated.amount);
      if (contractNumber && Number.isFinite(amount) && amount > 0) {
        try {
          const contract = await prisma.purchaseContract.findUnique({
            where: { contractNumber }
          });
          if (contract) {
            const currentDepositPaid = Number(contract.depositPaid);
            const currentTotalPaid = Number(contract.totalPaid);
            const totalAmount = Number(contract.totalAmount);
            const newDepositPaid = currentDepositPaid + amount;
            const newTotalPaid = currentTotalPaid + amount;
            const newTotalOwed = totalAmount - newTotalPaid;
            await prisma.purchaseContract.update({
              where: { id: contract.id },
              data: {
                depositPaid: newDepositPaid,
                totalPaid: newTotalPaid,
                totalOwed: newTotalOwed,
                status: newTotalPaid >= totalAmount ? 'SETTLED' : contract.status,
                updatedAt: new Date()
              }
            });
          }
        } catch (err) {
        }
      }
    }

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt?.toISOString(),
      paidBy: updated.paidBy,
      paidAt: updated.paidAt?.toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update expense request', details: error.message },
      { status: 500 }
    );
  }
}
