import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// DELETE - 删除出库批次
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const batch = await prisma.outboundBatch.findUnique({
      where: { id: params.id }
    })

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      )
    }

    // 删除批次
    await prisma.outboundBatch.delete({
      where: { id: params.id }
    })

    // 更新出库单的已出库数量
    const outboundOrder = await prisma.outboundOrder.findUnique({
      where: { id: batch.outboundOrderId }
    })

    if (outboundOrder) {
      const newShippedQty = Math.max(0, outboundOrder.shippedQty - batch.qty)
      let newStatus = outboundOrder.status

      if (newShippedQty === 0) {
        newStatus = '待出库'
      } else if (newShippedQty < outboundOrder.qty) {
        newStatus = '部分出库'
      } else {
        newStatus = '已出库'
      }

      await prisma.outboundOrder.update({
        where: { id: batch.outboundOrderId },
        data: {
          shippedQty: newShippedQty,
          status: newStatus
        }
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to delete outbound batch' },
      { status: 500 }
    )
  }
}
