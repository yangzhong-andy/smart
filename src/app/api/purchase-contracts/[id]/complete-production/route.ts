import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST - 提交生产完成：将合同下所有明细的完工数设为合同数量
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contractId = params.id

    const contract = await prisma.purchaseContract.findUnique({
      where: { id: contractId },
      include: {
        items: true
      }
    })
    if (!contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 404 })
    }

    await prisma.$transaction(
      contract.items.map((item) =>
        prisma.purchaseContractItem.update({
          where: { id: item.id },
          data: { finishedQty: item.qty, updatedAt: new Date() }
        })
      )
    )

    return NextResponse.json({ ok: true, message: '已提交生产完成' })
  } catch (error: any) {
    return NextResponse.json(
      { error: '提交生产完成失败', details: error.message },
      { status: 500 }
    )
  }
}
