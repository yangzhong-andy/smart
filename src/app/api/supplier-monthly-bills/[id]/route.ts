import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const typeToFront: Record<string, string> = {
  AD_AGENCY: '广告代理商',
  LOGISTICS: '物流商',
  VENDOR: '供货商'
};

function toBill(row: any) {
  return {
    id: row.id,
    uid: row.uid ?? undefined,
    supplierProfileId: row.supplierProfileId,
    supplierName: row.supplierName,
    supplierType: typeToFront[row.supplierType] ?? row.supplierType,
    month: row.month,
    billNumber: row.billNumber ?? undefined,
    billDate: row.billDate.toISOString().split('T')[0],
    supplierBillAmount: Number(row.supplierBillAmount),
    systemAmount: Number(row.systemAmount),
    difference: Number(row.difference),
    currency: row.currency,
    rebateAmount: Number(row.rebateAmount),
    rebateRate: row.rebateRate != null ? Number(row.rebateRate) : undefined,
    netAmount: Number(row.netAmount),
    relatedFlowIds: row.relatedFlowIds ?? [],
    uploadedBillFile: row.uploadedBillFile ?? undefined,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString(),
    approvedBy: row.approvedBy ?? undefined,
    approvedAt: row.approvedAt?.toISOString(),
    rejectionReason: row.rejectionReason ?? undefined,
    paidBy: row.paidBy ?? undefined,
    paidAt: row.paidAt?.toISOString(),
    paymentAccountId: row.paymentAccountId ?? undefined,
    paymentAccountName: row.paymentAccountName ?? undefined,
    paymentMethod: row.paymentMethod ?? undefined,
    paymentFlowId: row.paymentFlowId ?? undefined,
    paymentVoucher: row.paymentVoucher ?? undefined,
    notes: row.notes ?? undefined
  };
}

// GET - 获取单条账单
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.supplierMonthlyBill.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toBill(row));
  } catch (error: any) {
    console.error('Error fetching supplier monthly bill:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier monthly bill', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新账单
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, any> = {};
    if (body.uid !== undefined) updateData.uid = body.uid;
    if (body.supplierProfileId != null) updateData.supplierProfileId = body.supplierProfileId;
    if (body.supplierName != null) updateData.supplierName = String(body.supplierName).trim();
    if (body.supplierType != null) updateData.supplierType = body.supplierType;
    if (body.month != null) updateData.month = String(body.month);
    if (body.billNumber !== undefined) updateData.billNumber = body.billNumber ? String(body.billNumber) : null;
    if (body.billDate != null) updateData.billDate = new Date(body.billDate);
    if (body.supplierBillAmount != null) updateData.supplierBillAmount = Number(body.supplierBillAmount);
    if (body.systemAmount != null) updateData.systemAmount = Number(body.systemAmount);
    if (body.difference != null) updateData.difference = Number(body.difference);
    if (body.currency != null) updateData.currency = body.currency;
    if (body.rebateAmount != null) updateData.rebateAmount = Number(body.rebateAmount);
    if (body.rebateRate !== undefined) updateData.rebateRate = body.rebateRate != null ? Number(body.rebateRate) : null;
    if (body.netAmount != null) updateData.netAmount = Number(body.netAmount);
    if (body.relatedFlowIds !== undefined) updateData.relatedFlowIds = Array.isArray(body.relatedFlowIds) ? body.relatedFlowIds : [];
    if (body.uploadedBillFile !== undefined) updateData.uploadedBillFile = body.uploadedBillFile ?? null;
    if (body.status != null) updateData.status = body.status;
    if (body.createdBy != null) updateData.createdBy = body.createdBy;
    if (body.submittedAt !== undefined) updateData.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null;
    if (body.approvedBy !== undefined) updateData.approvedBy = body.approvedBy ?? null;
    if (body.approvedAt !== undefined) updateData.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
    if (body.rejectionReason !== undefined) updateData.rejectionReason = body.rejectionReason ?? null;
    if (body.paidBy !== undefined) updateData.paidBy = body.paidBy ?? null;
    if (body.paidAt !== undefined) updateData.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    if (body.paymentAccountId !== undefined) updateData.paymentAccountId = body.paymentAccountId ?? null;
    if (body.paymentAccountName !== undefined) updateData.paymentAccountName = body.paymentAccountName ?? null;
    if (body.paymentMethod !== undefined) updateData.paymentMethod = body.paymentMethod ?? null;
    if (body.paymentFlowId !== undefined) updateData.paymentFlowId = body.paymentFlowId ?? null;
    if (body.paymentVoucher !== undefined) updateData.paymentVoucher = body.paymentVoucher ?? null;
    if (body.notes !== undefined) updateData.notes = body.notes ?? null;

    const row = await prisma.supplierMonthlyBill.update({
      where: { id },
      data: updateData
    });

    return NextResponse.json(toBill(row));
  } catch (error: any) {
    console.error('Error updating supplier monthly bill:', error);
    return NextResponse.json(
      { error: 'Failed to update supplier monthly bill', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除账单
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.supplierMonthlyBill.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting supplier monthly bill:', error);
    return NextResponse.json(
      { error: 'Failed to delete supplier monthly bill', details: error.message },
      { status: 500 }
    );
  }
}
