import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function toPayment(row: any) {
  return {
    id: row.id,
    billId: row.billId,
    supplierProfileId: row.supplierProfileId,
    supplierName: row.supplierName,
    amount: Number(row.amount),
    currency: row.currency,
    paymentDate: row.paymentDate.toISOString().split('T')[0],
    paymentAccountId: row.paymentAccountId,
    paymentAccountName: row.paymentAccountName,
    paymentMethod: row.paymentMethod,
    paymentFlowId: row.paymentFlowId,
    paymentVoucher: row.paymentVoucher ?? undefined,
    paidBy: row.paidBy,
    paidAt: row.paidAt.toISOString(),
    notes: row.notes ?? undefined
  };
}

// GET - 获取供应商付款记录（支持 billId、supplierProfileId 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const billId = searchParams.get('billId');
    const supplierProfileId = searchParams.get('supplierProfileId');

    const where: { billId?: string; supplierProfileId?: string } = {};
    if (billId) where.billId = billId;
    if (supplierProfileId) where.supplierProfileId = supplierProfileId;

    const list = await prisma.supplierPayment.findMany({
      where,
      orderBy: { paidAt: 'desc' }
    });

    return NextResponse.json(list.map(toPayment));
  } catch (error: any) {
    console.error('Error fetching supplier payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier payments', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建供应商付款记录
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { billId, supplierProfileId, supplierName, amount, currency, paymentDate, paymentAccountId, paymentAccountName, paymentMethod, paymentFlowId, paymentVoucher, paidBy, paidAt, notes } = body;

    if (!billId || !supplierProfileId || !supplierName || amount == null || !currency || !paymentDate || !paymentAccountId || !paymentAccountName || !paymentMethod || !paymentFlowId || !paidBy || !paidAt) {
      return NextResponse.json(
        { error: 'billId, supplierProfileId, supplierName, amount, currency, paymentDate, paymentAccountId, paymentAccountName, paymentMethod, paymentFlowId, paidBy, paidAt 不能为空' },
        { status: 400 }
      );
    }

    const row = await prisma.supplierPayment.create({
      data: {
        billId,
        supplierProfileId,
        supplierName: String(supplierName).trim(),
        amount: Number(amount),
        currency: String(currency),
        paymentDate: new Date(paymentDate),
        paymentAccountId: String(paymentAccountId),
        paymentAccountName: String(paymentAccountName).trim(),
        paymentMethod: String(paymentMethod).trim(),
        paymentFlowId: String(paymentFlowId),
        paymentVoucher: paymentVoucher ?? null,
        paidBy: String(paidBy).trim(),
        paidAt: new Date(paidAt),
        notes: notes ? String(notes) : null
      }
    });

    return NextResponse.json(toPayment(row), { status: 201 });
  } catch (error: any) {
    console.error('Error creating supplier payment:', error);
    return NextResponse.json(
      { error: 'Failed to create supplier payment', details: error.message },
      { status: 500 }
    );
  }
}
