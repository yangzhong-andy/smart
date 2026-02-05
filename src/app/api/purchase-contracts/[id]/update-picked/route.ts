import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PurchaseContractStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const STATUS_MAP: Record<PurchaseContractStatus, string> = {
  PENDING_SHIPMENT: '待发货',
  PARTIAL_SHIPMENT: '部分发货',
  SHIPPED: '发货完成',
  SETTLED: '已结清',
  CANCELLED: '已取消'
}

/**
 * POST - 按变体增加已取货数（发起拿货时按 SKU 提交数量后调用）
 * body: { items: [{ itemId: string, qty: number }] }
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
        { error: '请至少填写一条变体的拿货数量' },
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
    const updates: { itemId: string; addQty: number }[] = []
    for (const row of itemsInput) {
      const itemId = row.itemId
      const qty = Math.round(Number(row.qty) || 0)
      if (qty <= 0 || !itemId) continue
      if (!itemIds.has(itemId)) {
        return NextResponse.json(
          { error: `合同明细不存在: ${itemId}` },
          { status: 400 }
        )
      }
      updates.push({ itemId, addQty: qty })
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: '本次拿货数量需大于 0' },
        { status: 400 }
      )
    }

    for (const { itemId, addQty } of updates) {
      const item = contract.items.find((i) => i.id === itemId)
      if (!item) continue
      const newPicked = item.pickedQty + addQty
      if (newPicked > item.qty) {
        return NextResponse.json(
          { error: `变体 ${item.sku} 本次拿货 ${addQty} 超过剩余数量 ${item.qty - item.pickedQty}` },
          { status: 400 }
        )
      }
      await prisma.purchaseContractItem.update({
        where: { id: itemId },
        data: { pickedQty: newPicked, updatedAt: new Date() }
      })
    }

    const updatedItems = await prisma.purchaseContractItem.findMany({
      where: { contractId }
    })
    const totalQty = updatedItems.reduce((s, i) => s + i.qty, 0)
    const pickedQty = updatedItems.reduce((s, i) => s + i.pickedQty, 0)
    let status: PurchaseContractStatus = contract.status
    if (pickedQty >= totalQty) {
      status = PurchaseContractStatus.SHIPPED
    } else if (pickedQty > 0) {
      status = PurchaseContractStatus.PARTIAL_SHIPMENT
    } else {
      status = PurchaseContractStatus.PENDING_SHIPMENT
    }

    await prisma.purchaseContract.update({
      where: { id: contractId },
      data: { pickedQty, status, updatedAt: new Date() }
    })

    return NextResponse.json({
      success: true,
      pickedQty,
      totalQty,
      status: STATUS_MAP[status]
    })
  } catch (error: any) {
    console.error('Error updating contract picked qty:', error)
    return NextResponse.json(
      { error: error?.message || '更新已取货数失败' },
      { status: 500 }
    )
  }
}
