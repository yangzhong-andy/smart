import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const typeFromFront: Record<string, 'AD_AGENCY' | 'LOGISTICS' | 'VENDOR'> = {
  广告代理商: 'AD_AGENCY',
  物流商: 'LOGISTICS',
  供货商: 'VENDOR'
};
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

// GET - 获取供应商月度账单（支持 supplierProfileId、month、status 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierProfileId = searchParams.get('supplierProfileId');
    const month = searchParams.get('month');
    const status = searchParams.get('status');

    const where: { supplierProfileId?: string; month?: string; status?: string } = {};
    if (supplierProfileId) where.supplierProfileId = supplierProfileId;
    if (month) where.month = month;
    if (status) where.status = status;

    const list = await prisma.supplierMonthlyBill.findMany({
      where,
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }]
    });

    return NextResponse.json(list.map(toBill));
  } catch (error: any) {
    console.error('Error fetching supplier monthly bills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier monthly bills', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建供应商月度账单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      uid,
      supplierProfileId,
      supplierName,
      supplierType,
      month,
      billNumber,
      billDate,
      supplierBillAmount,
      systemAmount,
      difference,
      currency,
      rebateAmount,
      rebateRate,
      netAmount,
      relatedFlowIds,
      uploadedBillFile,
      status,
      createdBy,
      submittedAt,
      approvedBy,
      approvedAt,
      rejectionReason,
      paidBy,
      paidAt,
      paymentAccountId,
      paymentAccountName,
      paymentMethod,
      paymentFlowId,
      paymentVoucher,
      notes
    } = body;

    if (!supplierProfileId || !supplierName || !supplierType || !month || billDate == null || supplierBillAmount == null || systemAmount == null || difference == null || !currency || rebateAmount == null || netAmount == null || !status || !createdBy) {
      return NextResponse.json(
        { error: 'supplierProfileId, supplierName, supplierType, month, billDate, supplierBillAmount, systemAmount, difference, currency, rebateAmount, netAmount, status, createdBy 不能为空' },
        { status: 400 }
      );
    }

    const prismaType = typeFromFront[supplierType] ?? (supplierType === 'AD_AGENCY' || supplierType === 'LOGISTICS' || supplierType === 'VENDOR' ? supplierType : 'VENDOR');
    const billDateObj = typeof billDate === 'string' ? new Date(billDate) : new Date();

    const row = await prisma.supplierMonthlyBill.create({
      data: {
        uid: uid ?? null,
        supplierProfileId,
        supplierName: String(supplierName).trim(),
        supplierType: prismaType,
        month: String(month),
        billNumber: billNumber ? String(billNumber) : null,
        billDate: billDateObj,
        supplierBillAmount: Number(supplierBillAmount),
        systemAmount: Number(systemAmount),
        difference: Number(difference),
        currency: String(currency),
        rebateAmount: Number(rebateAmount),
        rebateRate: rebateRate != null ? Number(rebateRate) : null,
        netAmount: Number(netAmount),
        relatedFlowIds: Array.isArray(relatedFlowIds) ? relatedFlowIds : [],
        uploadedBillFile: uploadedBillFile ?? null,
        status: status as 'Draft' | 'Pending_Approval' | 'Approved' | 'Paid' | 'Rejected',
        createdBy: String(createdBy),
        submittedAt: submittedAt ? new Date(submittedAt) : null,
        approvedBy: approvedBy ?? null,
        approvedAt: approvedAt ? new Date(approvedAt) : null,
        rejectionReason: rejectionReason ?? null,
        paidBy: paidBy ?? null,
        paidAt: paidAt ? new Date(paidAt) : null,
        paymentAccountId: paymentAccountId ?? null,
        paymentAccountName: paymentAccountName ?? null,
        paymentMethod: paymentMethod ?? null,
        paymentFlowId: paymentFlowId ?? null,
        paymentVoucher: paymentVoucher ?? null,
        notes: notes ?? null
      }
    });

    return NextResponse.json(toBill(row), { status: 201 });
  } catch (error: any) {
    console.error('Error creating supplier monthly bill:', error);
    return NextResponse.json(
      { error: 'Failed to create supplier monthly bill', details: error.message },
      { status: 500 }
    );
  }
}
