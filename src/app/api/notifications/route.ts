import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const typeMap = {
  payment_required: 'payment_required',
  approval_rejected: 'approval_rejected',
  payment_completed: 'payment_completed',
  cashier_review_required: 'cashier_review_required',
  finance_payment_required: 'finance_payment_required'
} as const;

const relatedTypeMap = { monthly_bill: 'monthly_bill', payment_request: 'payment_request', other: 'other' } as const;
const priorityMap = { high: 'high', medium: 'medium', low: 'low' } as const;

// GET - 获取通知列表（支持 relatedId、relatedType、read 筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const relatedId = searchParams.get('relatedId');
    const relatedType = searchParams.get('relatedType');
    const read = searchParams.get('read');

    const where: { relatedId?: string; relatedType?: 'monthly_bill' | 'payment_request' | 'other'; read?: boolean } = {};
    if (relatedId) where.relatedId = relatedId;
    if (relatedType === 'monthly_bill' || relatedType === 'payment_request' || relatedType === 'other')
      where.relatedType = relatedType;
    if (read !== undefined && read !== null && read !== '') where.read = read === 'true';

    const list = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    const transformed = list.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      relatedId: n.relatedId,
      relatedType: n.relatedType,
      createdAt: n.createdAt.toISOString(),
      read: n.read,
      readAt: n.readAt?.toISOString(),
      actionUrl: n.actionUrl ?? undefined,
      priority: n.priority
    }));

    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建通知
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, title, message, relatedId, relatedType, actionUrl, priority } = body;

    if (!type || !title || !message || !relatedId || !relatedType) {
      return NextResponse.json(
        { error: 'type, title, message, relatedId, relatedType 不能为空' },
        { status: 400 }
      );
    }

    const prismaType = typeMap[type as keyof typeof typeMap] ?? 'payment_required';
    const prismaRelatedType = relatedTypeMap[relatedType as keyof typeof relatedTypeMap] ?? 'other';
    const prismaPriority = priorityMap[priority as keyof typeof priorityMap] ?? 'medium';

    const n = await prisma.notification.create({
      data: {
        type: prismaType,
        title: String(title).trim(),
        message: String(message).trim(),
        relatedId: String(relatedId),
        relatedType: prismaRelatedType,
        actionUrl: actionUrl ? String(actionUrl) : null,
        priority: prismaPriority
      }
    });

    return NextResponse.json(
      {
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        relatedId: n.relatedId,
        relatedType: n.relatedType,
        createdAt: n.createdAt.toISOString(),
        read: n.read,
        readAt: n.readAt?.toISOString(),
        actionUrl: n.actionUrl ?? undefined,
        priority: n.priority
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { error: 'Failed to create notification', details: error.message },
      { status: 500 }
    );
  }
}
