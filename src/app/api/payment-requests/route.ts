import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 获取所有付款申请
export async function GET(request: NextRequest) {
  try {
    await prisma.$connect().catch(() => {
      // 连接失败时继续尝试查询，Prisma 会自动重连
    });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    
    const where: any = {};
    if (status) {
      where.status = status;
    }
    
    // 注意：PaymentRequest 可能存储在 MonthlyBill 表中，或者需要创建新表
    // 这里先使用 expenseRequest 表作为临时方案，或者需要创建新的 paymentRequest 表
    // 根据实际数据库结构调整
    
    // 如果 PaymentRequest 存储在 expenseRequest 表中（通过 category 区分）
    // 或者需要创建新的 paymentRequest 表
    // 这里假设使用 expenseRequest 表，通过 category 字段区分
    
    const requests = await prisma.expenseRequest.findMany({
      where: {
        ...where,
        // 可以通过 summary 或其他字段标识为 PaymentRequest
        // 或者创建新的 paymentRequest 表
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // 转换格式以匹配前端 PaymentRequest 类型
    const transformed = requests.map(req => ({
      id: req.id,
      expenseItem: req.summary, // 使用 summary 作为 expenseItem
      amount: Number(req.amount),
      currency: req.currency as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD",
      storeId: req.storeId || undefined,
      storeName: req.storeName || undefined,
      country: req.country || undefined,
      category: req.category,
      approvalDocument: req.voucher ? (req.voucher.startsWith('[') ? JSON.parse(req.voucher) : req.voucher) : undefined,
      paymentReceipt: undefined, // 需要单独存储
      status: req.status as any,
      createdBy: req.createdBy,
      createdAt: req.createdAt.toISOString(),
      submittedAt: req.submittedAt?.toISOString(),
      approvedBy: req.approvedBy || undefined,
      approvedAt: req.approvedAt?.toISOString(),
      rejectionReason: req.rejectionReason || undefined,
      paidBy: req.paidBy || undefined,
      paidAt: req.paidAt?.toISOString(),
      paymentAccountId: req.financeAccountId || undefined,
      paymentAccountName: req.financeAccountName || undefined,
      paymentFlowId: req.paymentFlowId || undefined,
      notes: req.remark || undefined
    }));
    
    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Error fetching payment requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment requests', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建付款申请
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 创建付款申请（使用 expenseRequest 表，通过 category 或其他字段区分）
    const paymentRequest = await prisma.expenseRequest.create({
      data: {
        uid: body.uid || null,
        date: new Date(body.date || new Date()),
        summary: body.expenseItem,
        category: body.category || '运营费用',
        amount: body.amount,
        currency: body.currency || 'RMB',
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        country: body.country || null,
        remark: body.notes || null,
        voucher: body.approvalDocument ? (Array.isArray(body.approvalDocument) ? JSON.stringify(body.approvalDocument) : body.approvalDocument) : null,
        status: body.status || 'Draft',
        createdBy: body.createdBy || '系统',
        submittedAt: body.submittedAt ? new Date(body.submittedAt) : null
      }
    });
    
    return NextResponse.json({
      id: paymentRequest.id,
      expenseItem: paymentRequest.summary,
      amount: Number(paymentRequest.amount),
      currency: paymentRequest.currency as "RMB" | "USD" | "JPY" | "EUR" | "GBP" | "HKD" | "SGD" | "AUD",
      storeId: paymentRequest.storeId || undefined,
      storeName: paymentRequest.storeName || undefined,
      country: paymentRequest.country || undefined,
      category: paymentRequest.category,
      approvalDocument: paymentRequest.voucher ? (paymentRequest.voucher.startsWith('[') ? JSON.parse(paymentRequest.voucher) : paymentRequest.voucher) : undefined,
      status: paymentRequest.status as any,
      createdBy: paymentRequest.createdBy,
      createdAt: paymentRequest.createdAt.toISOString(),
      submittedAt: paymentRequest.submittedAt?.toISOString(),
      notes: paymentRequest.remark || undefined
    });
  } catch (error: any) {
    console.error('Error creating payment request:', error);
    return NextResponse.json(
      { error: 'Failed to create payment request', details: error.message },
      { status: 500 }
    );
  }
}
