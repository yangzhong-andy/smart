import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * POST - 按变体更新完工数
 * body: { items: [{ itemId: string, finishedQty: number }] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contractId = params.id
    const body = await request.json()
    const itemsInput = Array.isArray(body.items) ? body.items : []

    if (itemsInput.length === 0) {
      return NextResponse.json(
        { error: '请至少填写一条变体的完工数量' },
        { status: 400 }
      )
    }

    const contract = await prisma.purchaseContract.findUnique({
      where: { id: contractId },
      include: { items: true }
    })
    if (!contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 404 })
    }

    const itemIds = new Set(contract.items.map((i) => i.id))
    for (const row of itemsInput) {
      const itemId = row.itemId
      const finishedQty = Math.round(Number(row.finishedQty) ?? 0)
      if (!itemId || itemIds.has(itemId) === false) {
        return NextResponse.json(
          { error: `合同明细不存在: ${itemId}` },
          { status: 400 }
        )
      }
      const item = contract.items.find((i) => i.id === itemId)
      if (!item) continue
      if (finishedQty < 0 || finishedQty > item.qty) {
        return NextResponse.json(
          { error: `变体 ${item.sku} 完工数需在 0～${item.qty} 之间` },
          { status: 400 }
        )
      }
      await prisma.purchaseContractItem.update({
        where: { id: itemId },
        data: { finishedQty, updatedAt: new Date() }
      })
    }

    return NextResponse.json({ ok: true, message: '已更新完工数量' })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '更新完工数失败' },
      { status: 500 }
    )
  }
}
