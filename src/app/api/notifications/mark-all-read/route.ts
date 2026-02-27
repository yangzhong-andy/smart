import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST - 标记所有通知为已读
export async function POST() {
  try {
    await prisma.notification.updateMany({
      where: { read: false },
      data: { read: true, readAt: new Date() }
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to mark all read', details: error.message },
      { status: 500 }
    );
  }
}
