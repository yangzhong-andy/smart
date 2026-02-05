import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET - 获取所有收入申请
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const where: any = {};
    if (status) {
      where.status = status;
    }
    
    const requests = await prisma.incomeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    // 转换格式以匹配前端类型
    const transformed = requests.map(req => ({
      id: req.id,
      uid: req.uid || undefined,
      date: req.date.toISOString().slice(0, 10),
      summary: req.summary,
      category: req.category,
      amount: Number(req.amount),
      currency: req.currency,
      storeId: req.storeId || undefined,
      storeName: req.storeName || undefined,
      remark: req.remark || undefined,
      voucher: req.voucher ? (req.voucher.startsWith('[') ? JSON.parse(req.voucher) : req.voucher) : undefined,
      status: req.status as any,
      createdBy: req.createdBy,
      createdAt: req.createdAt.toISOString(),
      submittedAt: req.submittedAt?.toISOString(),
      approvedBy: req.approvedBy || undefined,
      approvedAt: req.approvedAt?.toISOString(),
      rejectionReason: req.rejectionReason || undefined,
      financeAccountId: req.financeAccountId || undefined,
      financeAccountName: req.financeAccountName || undefined,
      receivedBy: req.receivedBy || undefined,
      receivedAt: req.receivedAt?.toISOString(),
      paymentFlowId: req.paymentFlowId || undefined,
      paymentVoucher: req.paymentVoucher ? (req.paymentVoucher.startsWith('[') ? JSON.parse(req.paymentVoucher) : req.paymentVoucher) : undefined
    }));
    
    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Error fetching income requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch income requests', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建收入申请
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const incomeRequest = await prisma.incomeRequest.create({
      data: {
        uid: body.uid || null,
        date: new Date(body.date),
        summary: body.summary,
        category: body.category,
        amount: body.amount,
        currency: body.currency || 'CNY',
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        remark: body.remark || null,
        voucher: body.voucher ? (Array.isArray(body.voucher) ? JSON.stringify(body.voucher) : body.voucher) : null,
        status: body.status || 'Pending_Approval',
        createdBy: body.createdBy || '系统',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date()
      }
    });
    
    return NextResponse.json({
      id: incomeRequest.id,
      uid: incomeRequest.uid || undefined,
      date: incomeRequest.date.toISOString().slice(0, 10),
      summary: incomeRequest.summary,
      category: incomeRequest.category,
      amount: Number(incomeRequest.amount),
      currency: incomeRequest.currency,
      status: incomeRequest.status,
      createdBy: incomeRequest.createdBy,
      createdAt: incomeRequest.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('Error creating income request:', error);
    return NextResponse.json(
      { error: 'Failed to create income request', details: error.message },
      { status: 500 }
    );
  }
}
