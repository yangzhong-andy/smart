import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 与列表接口保持一致的缓存前缀
const CACHE_KEY_PREFIX = 'purchase-contracts'

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
    const now = new Date()

    // 在事务中更新明细并同步合同完工数量
    await prisma.$transaction(async (tx) => {
      for (const row of itemsInput) {
        const itemId = row.itemId
        const finishedQty = Math.round(Number(row.finishedQty) ?? 0)
        if (!itemId || itemIds.has(itemId) === false) {
          throw new Error(`合同明细不存在: ${itemId}`)
        }
        const item = contract.items.find((i) => i.id === itemId)
        if (!item) continue
        if (finishedQty < 0 || finishedQty > item.qty) {
          throw new Error(`变体 ${item.sku} 完工数需在 0～${item.qty} 之间`)
        }
        await tx.purchaseContractItem.update({
          where: { id: itemId },
          data: { finishedQty, updatedAt: now }
        })
      }

      // 重新聚合该合同下所有明细的完工数量，写回合同表
      const agg = await tx.purchaseContractItem.aggregate({
        where: { contractId },
        _sum: { finishedQty: true }
      })

      await tx.purchaseContract.update({
        where: { id: contractId },
        data: {
          finishedQty: agg._sum.finishedQty ?? 0,
          updatedAt: now
        }
      })
    })

    // 清除采购合同列表缓存，保证生产进度页面统计即时更新
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({ ok: true, message: '已更新完工数量' })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '更新完工数失败' },
      { status: 500 }
    )
  }
}
