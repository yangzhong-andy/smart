import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 获取所有支出申请
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const where: any = {};
    if (status) {
      where.status = status;
    }
    
    const requests = await prisma.expenseRequest.findMany({
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
      businessNumber: req.businessNumber || undefined,
      relatedId: req.relatedId || undefined,
      remark: req.remark || undefined,
      voucher: req.voucher ? (req.voucher.startsWith('[') ? JSON.parse(req.voucher) : req.voucher) : undefined,
      storeId: req.storeId || undefined,
      storeName: req.storeName || undefined,
      country: req.country || undefined,
      departmentId: req.departmentId || undefined,
      departmentName: req.departmentName || undefined,
      status: req.status as any,
      createdBy: req.createdBy,
      createdAt: req.createdAt.toISOString(),
      submittedAt: req.submittedAt?.toISOString(),
      approvedBy: req.approvedBy || undefined,
      approvedAt: req.approvedAt?.toISOString(),
      rejectionReason: req.rejectionReason || undefined,
      financeAccountId: req.financeAccountId || undefined,
      financeAccountName: req.financeAccountName || undefined,
      paidBy: req.paidBy || undefined,
      paidAt: req.paidAt?.toISOString(),
      paymentFlowId: req.paymentFlowId || undefined,
      paymentVoucher: req.paymentVoucher ? (req.paymentVoucher.startsWith('[') ? JSON.parse(req.paymentVoucher) : req.paymentVoucher) : undefined,
      adAccountId: req.adAccountId || undefined,
      rebateAmount: req.rebateAmount ? Number(req.rebateAmount) : undefined
    }));
    
    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Error fetching expense requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch expense requests', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建支出申请
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const expenseRequest = await prisma.expenseRequest.create({
      data: {
        uid: body.uid || null,
        date: new Date(body.date),
        summary: body.summary,
        category: body.category,
        amount: body.amount,
        currency: body.currency || 'CNY',
        businessNumber: body.businessNumber || null,
        relatedId: body.relatedId || null,
        remark: body.remark || null,
        voucher: body.voucher ? (Array.isArray(body.voucher) ? JSON.stringify(body.voucher) : body.voucher) : null,
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        country: body.country || null,
        departmentId: body.departmentId || null,
        departmentName: body.departmentName || null,
        status: body.status || 'Pending_Approval',
        createdBy: body.createdBy || '系统',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
        adAccountId: body.adAccountId || null,
        rebateAmount: body.rebateAmount || null
      }
    });
    
    return NextResponse.json({
      id: expenseRequest.id,
      uid: expenseRequest.uid || undefined,
      date: expenseRequest.date.toISOString().slice(0, 10),
      summary: expenseRequest.summary,
      category: expenseRequest.category,
      amount: Number(expenseRequest.amount),
      currency: expenseRequest.currency,
      status: expenseRequest.status,
      createdBy: expenseRequest.createdBy,
      createdAt: expenseRequest.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('Error creating expense request:', error);
    return NextResponse.json(
      { error: 'Failed to create expense request', details: error.message },
      { status: 500 }
    );
  }
}
