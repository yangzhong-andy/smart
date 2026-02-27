import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 与列表接口保持一致的缓存前缀
const CACHE_KEY_PREFIX = 'purchase-contracts'

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

    const now = new Date()

    // 在事务中更新明细 + 合同完工数
    await prisma.$transaction(async (tx) => {
      // 1. 明细全部设为合同数量
      await Promise.all(
        contract.items.map((item) =>
          tx.purchaseContractItem.update({
            where: { id: item.id },
            data: { finishedQty: item.qty, updatedAt: now }
          })
        )
      )

      // 2. 合同层面的完工数量更新为总数，便于统计
      await tx.purchaseContract.update({
        where: { id: contractId },
        data: {
          finishedQty: contract.totalQty,
          updatedAt: now
        }
      })
    })

    // 3. 清理采购合同列表缓存，确保生产进度页面能看到最新完工数量
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({ ok: true, message: '已提交生产完成' })
  } catch (error: any) {
    return NextResponse.json(
      { error: '提交生产完成失败', details: error.message },
      { status: 500 }
    )
  }
}
