import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// DELETE - 删除入库批次
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const batch = await prisma.inboundBatch.findUnique({
      where: { id: params.id }
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      )
    }

    // 删除批次
    await prisma.inboundBatch.delete({
      where: { id: params.id }
    })

    // 更新待入库单的已入库数量
    const pendingInbound = await prisma.pendingInbound.findUnique({
      where: { id: batch.pendingInboundId }
    })

    if (pendingInbound) {
      const newReceivedQty = Math.max(0, pendingInbound.receivedQty - batch.qty)
      let newStatus = pendingInbound.status

      if (newReceivedQty === 0) {
        newStatus = '待入库'
      } else if (newReceivedQty < pendingInbound.qty) {
        newStatus = '部分入库'
      } else {
        newStatus = '已入库'
      }

      await prisma.pendingInbound.update({
        where: { id: batch.pendingInboundId },
        data: {
          receivedQty: newReceivedQty,
          status: newStatus
        }
      })
    }

    await clearCacheByPrefix('inbound-batches')
    await clearCacheByPrefix('pending-inbound')

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete inbound batch' },
      { status: 500 }
    )
  }
}
