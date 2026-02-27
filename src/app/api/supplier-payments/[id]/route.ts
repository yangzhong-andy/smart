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

// GET - 获取单条付款记录
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const row = await prisma.supplierPayment.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(toPayment(row));
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch supplier payment', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新付款记录
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, any> = {};
    if (body.billId != null) data.billId = body.billId;
    if (body.supplierProfileId != null) data.supplierProfileId = body.supplierProfileId;
    if (body.supplierName != null) data.supplierName = String(body.supplierName).trim();
    if (body.amount != null) data.amount = Number(body.amount);
    if (body.currency != null) data.currency = body.currency;
    if (body.paymentDate != null) data.paymentDate = new Date(body.paymentDate);
    if (body.paymentAccountId != null) data.paymentAccountId = body.paymentAccountId;
    if (body.paymentAccountName != null) data.paymentAccountName = body.paymentAccountName;
    if (body.paymentMethod != null) data.paymentMethod = body.paymentMethod;
    if (body.paymentFlowId != null) data.paymentFlowId = body.paymentFlowId;
    if (body.paymentVoucher !== undefined) data.paymentVoucher = body.paymentVoucher ?? null;
    if (body.paidBy != null) data.paidBy = body.paidBy;
    if (body.paidAt != null) data.paidAt = new Date(body.paidAt);
    if (body.notes !== undefined) data.notes = body.notes ?? null;

    const row = await prisma.supplierPayment.update({
      where: { id },
      data
    });

    return NextResponse.json(toPayment(row));
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update supplier payment', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除付款记录
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.supplierPayment.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to delete supplier payment', details: error.message },
      { status: 500 }
    );
  }
}
