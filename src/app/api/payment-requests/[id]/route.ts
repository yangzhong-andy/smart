import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 获取单个付款申请
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    const request = await prisma.expenseRequest.findUnique({
      where: { id }
    });
    
    if (!request) {
      return NextResponse.json(
        { error: 'Payment request not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      id: request.id,
      expenseItem: request.summary,
      amount: Number(request.amount),
      currency: request.currency as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD",
      storeId: request.storeId || undefined,
      storeName: request.storeName || undefined,
      country: request.country || undefined,
      category: request.category,
      approvalDocument: request.voucher ? (request.voucher.startsWith('[') ? JSON.parse(request.voucher) : request.voucher) : undefined,
      status: request.status as any,
      createdBy: request.createdBy,
      createdAt: request.createdAt.toISOString(),
      submittedAt: request.submittedAt?.toISOString(),
      approvedBy: request.approvedBy || undefined,
      approvedAt: request.approvedAt?.toISOString(),
      rejectionReason: request.rejectionReason || undefined,
      paidBy: request.paidBy || undefined,
      paidAt: request.paidAt?.toISOString(),
      paymentAccountId: request.financeAccountId || undefined,
      paymentAccountName: request.financeAccountName || undefined,
      paymentFlowId: request.paymentFlowId || undefined,
      notes: request.remark || undefined
    });
  } catch (error: any) {
    console.error('Error fetching payment request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment request', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新付款申请
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    
    const updated = await prisma.expenseRequest.update({
      where: { id },
      data: {
        summary: body.expenseItem,
        category: body.category,
        amount: body.amount,
        currency: body.currency,
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        country: body.country || null,
        remark: body.notes || null,
        voucher: body.approvalDocument ? (Array.isArray(body.approvalDocument) ? JSON.stringify(body.approvalDocument) : body.approvalDocument) : null,
        status: body.status,
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : null,
        approvedBy: body.approvedBy || null,
        approvedAt: body.approvedAt ? new Date(body.approvedAt) : null,
        rejectionReason: body.rejectionReason || null,
        paidBy: body.paidBy || null,
        paidAt: body.paidAt ? new Date(body.paidAt) : null,
        financeAccountId: body.paymentAccountId || null,
        financeAccountName: body.paymentAccountName || null,
        paymentFlowId: body.paymentFlowId || null,
        updatedAt: new Date()
      }
    });
    
    return NextResponse.json({
      id: updated.id,
      expenseItem: updated.summary,
      amount: Number(updated.amount),
      currency: updated.currency as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD",
      storeId: updated.storeId || undefined,
      storeName: updated.storeName || undefined,
      country: updated.country || undefined,
      category: updated.category,
      approvalDocument: updated.voucher ? (updated.voucher.startsWith('[') ? JSON.parse(updated.voucher) : updated.voucher) : undefined,
      status: updated.status as any,
      createdBy: updated.createdBy,
      createdAt: updated.createdAt.toISOString(),
      submittedAt: updated.submittedAt?.toISOString(),
      approvedBy: updated.approvedBy || undefined,
      approvedAt: updated.approvedAt?.toISOString(),
      rejectionReason: updated.rejectionReason || undefined,
      paidBy: updated.paidBy || undefined,
      paidAt: updated.paidAt?.toISOString(),
      paymentAccountId: updated.financeAccountId || undefined,
      paymentAccountName: updated.financeAccountName || undefined,
      paymentFlowId: updated.paymentFlowId || undefined,
      notes: updated.remark || undefined
    });
  } catch (error: any) {
    console.error('Error updating payment request:', error);
    return NextResponse.json(
      { error: 'Failed to update payment request', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除付款申请
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    await prisma.expenseRequest.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting payment request:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment request', details: error.message },
      { status: 500 }
    );
  }
}
