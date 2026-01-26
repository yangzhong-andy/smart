import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 获取单个收入申请
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const incomeRequest = await prisma.incomeRequest.findUnique({
      where: { id: params.id }
    });
    
    if (!incomeRequest) {
      return NextResponse.json(
        { error: 'Income request not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      id: incomeRequest.id,
      uid: incomeRequest.uid || undefined,
      date: incomeRequest.date.toISOString().slice(0, 10),
      summary: incomeRequest.summary,
      category: incomeRequest.category,
      amount: Number(incomeRequest.amount),
      currency: incomeRequest.currency,
      storeId: incomeRequest.storeId || undefined,
      storeName: incomeRequest.storeName || undefined,
      remark: incomeRequest.remark || undefined,
      voucher: incomeRequest.voucher ? (incomeRequest.voucher.startsWith('[') ? JSON.parse(incomeRequest.voucher) : incomeRequest.voucher) : undefined,
      status: incomeRequest.status,
      createdBy: incomeRequest.createdBy,
      createdAt: incomeRequest.createdAt.toISOString(),
      submittedAt: incomeRequest.submittedAt?.toISOString(),
      approvedBy: incomeRequest.approvedBy || undefined,
      approvedAt: incomeRequest.approvedAt?.toISOString(),
      rejectionReason: incomeRequest.rejectionReason || undefined,
      financeAccountId: incomeRequest.financeAccountId || undefined,
      financeAccountName: incomeRequest.financeAccountName || undefined,
      receivedBy: incomeRequest.receivedBy || undefined,
      receivedAt: incomeRequest.receivedAt?.toISOString(),
      paymentFlowId: incomeRequest.paymentFlowId || undefined,
      paymentVoucher: incomeRequest.paymentVoucher ? (incomeRequest.paymentVoucher.startsWith('[') ? JSON.parse(incomeRequest.paymentVoucher) : incomeRequest.paymentVoucher) : undefined
    });
  } catch (error: any) {
    console.error('Error fetching income request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income request', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新收入申请
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
    if (body.receivedBy !== undefined) updateData.receivedBy = body.receivedBy;
    if (body.receivedAt !== undefined) updateData.receivedAt = body.receivedAt ? new Date(body.receivedAt) : null;
    if (body.paymentFlowId !== undefined) updateData.paymentFlowId = body.paymentFlowId;
    if (body.paymentVoucher !== undefined) {
      updateData.paymentVoucher = body.paymentVoucher 
        ? (Array.isArray(body.paymentVoucher) ? JSON.stringify(body.paymentVoucher) : body.paymentVoucher)
        : null;
    }
    
    const updated = await prisma.incomeRequest.update({
      where: { id: params.id },
      data: updateData
    });
    
    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      approvedBy: updated.approvedBy,
      approvedAt: updated.approvedAt?.toISOString(),
      receivedBy: updated.receivedBy,
      receivedAt: updated.receivedAt?.toISOString()
    });
  } catch (error: any) {
    console.error('Error updating income request:', error);
    return NextResponse.json(
      { error: 'Failed to update income request', details: error.message },
      { status: 500 }
    );
  }
}
