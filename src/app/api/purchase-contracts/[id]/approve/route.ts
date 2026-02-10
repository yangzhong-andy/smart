import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PurchaseContractStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const STATUS_MAP_DB_TO_FRONT: Record<PurchaseContractStatus, string> = {
  PENDING_APPROVAL: '待审批',
  PENDING_SHIPMENT: '待发货',
  PARTIAL_SHIPMENT: '部分发货',
  SHIPPED: '发货完成',
  SETTLED: '已结清',
  CANCELLED: '已取消'
}

function parseContractVoucher(v: string | null | undefined): string | string[] | undefined {
  if (v == null || v === '') return undefined
  const s = String(v).trim()
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s)
      return Array.isArray(arr) ? arr : s
    } catch {
      return s
    }
  }
  return s
}

/** POST - 主管审批合同：通过 -> 待发货，拒绝 -> 已取消 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    const body = await request.json()
    const result = body.result === '拒绝' ? '拒绝' : '通过'
    const approvedBy = typeof body.approvedBy === 'string' ? body.approvedBy.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null

    if (!approvedBy) {
      return NextResponse.json(
        { error: '请填写审批人姓名' },
        { status: 400 }
      )
    }

    const contract = await prisma.purchaseContract.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        },
        supplier: true
      }
    })

    if (!contract) {
      return NextResponse.json(
        { error: '采购合同不存在' },
        { status: 404 }
      )
    }

    if (contract.status !== PurchaseContractStatus.PENDING_APPROVAL) {
      return NextResponse.json(
        { error: '当前合同状态不可审批，仅待审批状态可操作' },
        { status: 400 }
      )
    }

    const newStatus = result === '通过'
      ? PurchaseContractStatus.PENDING_SHIPMENT
      : PurchaseContractStatus.CANCELLED

    const updated = await prisma.purchaseContract.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBy,
        approvedAt: new Date(),
        approvalNotes: notes || null
      },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        },
        supplier: true
      }
    })

    const totalQty = updated.items.reduce((s, i) => s + i.qty, 0)
    const pickedQty = updated.items.reduce((s, i) => s + i.pickedQty, 0)
    const finishedQty = updated.items.reduce((s, i) => s + i.finishedQty, 0)
    const firstItem = updated.items[0]

    return NextResponse.json({
      id: updated.id,
      contractNumber: updated.contractNumber,
      supplierId: updated.supplierId || '',
      supplierName: updated.supplierName,
      sku: firstItem ? `${firstItem.variant?.skuId || firstItem.sku} / ${firstItem.sku}` : '',
      skuId: firstItem?.variant?.skuId || undefined,
      unitPrice: firstItem ? Number(firstItem.unitPrice) : 0,
      totalQty,
      pickedQty,
      finishedQty,
      totalAmount: Number(updated.totalAmount),
      depositRate: Number(updated.depositRate),
      depositAmount: Number(updated.depositAmount),
      depositPaid: Number(updated.depositPaid),
      tailPeriodDays: updated.tailPeriodDays,
      deliveryDate: updated.deliveryDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[updated.status],
      contractVoucher: parseContractVoucher(updated.contractVoucher),
      totalPaid: Number(updated.totalPaid),
      totalOwed: Number(updated.totalOwed),
      relatedOrderIds: updated.relatedOrderIds || [],
      relatedOrderNumbers: updated.relatedOrderNumbers || [],
      approvedBy: updated.approvedBy ?? undefined,
      approvedAt: updated.approvedAt?.toISOString() ?? undefined,
      approvalNotes: updated.approvalNotes ?? undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      items: updated.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        sku: item.sku,
        variantSkuId: item.variant?.skuId,
        skuName: item.skuName,
        spec: item.spec,
        unitPrice: Number(item.unitPrice),
        qty: item.qty,
        pickedQty: item.pickedQty,
        finishedQty: item.finishedQty,
        totalAmount: Number(item.totalAmount),
        sortOrder: item.sortOrder,
        spuName: item.variant?.product?.name,
        spuId: item.variant?.productId
      }))
    })
  } catch (error: any) {
    console.error('Approve purchase contract error:', error)
    return NextResponse.json(
      { error: '审批失败', details: error?.message },
      { status: 500 }
    )
  }
}
