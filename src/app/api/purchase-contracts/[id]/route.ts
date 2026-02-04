import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PurchaseContractStatus } from '@prisma/client'

// 状态映射
const STATUS_MAP_DB_TO_FRONT: Record<PurchaseContractStatus, string> = {
  PENDING_SHIPMENT: '待发货',
  PARTIAL_SHIPMENT: '部分发货',
  SHIPPED: '发货完成',
  SETTLED: '已结清',
  CANCELLED: '已取消'
}

const STATUS_MAP_FRONT_TO_DB: Record<string, PurchaseContractStatus> = {
  '待发货': PurchaseContractStatus.PENDING_SHIPMENT,
  '部分发货': PurchaseContractStatus.PARTIAL_SHIPMENT,
  '发货完成': PurchaseContractStatus.SHIPPED,
  '已结清': PurchaseContractStatus.SETTLED,
  '已取消': PurchaseContractStatus.CANCELLED
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

// GET - 获取单个采购合同
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const contract = await prisma.purchaseContract.findUnique({
      where: { id: params.id },
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
        supplier: true,
        deliveryOrders: true
      }
    })

    if (!contract) {
      return NextResponse.json(
        { error: '采购合同不存在' },
        { status: 404 }
      )
    }

    const totalQty = contract.items.reduce((sum, item) => sum + item.qty, 0)
    const pickedQty = contract.items.reduce((sum, item) => sum + item.pickedQty, 0)
    const finishedQty = contract.items.reduce((sum, item) => sum + item.finishedQty, 0)
    const firstItem = contract.items[0]

    return NextResponse.json({
      id: contract.id,
      contractNumber: contract.contractNumber,
      supplierId: contract.supplierId || '',
      supplierName: contract.supplierName,
      sku: firstItem ? `${firstItem.variant?.skuId || firstItem.sku} / ${firstItem.sku}` : '',
      skuId: firstItem?.variant?.skuId || undefined,
      unitPrice: firstItem ? Number(firstItem.unitPrice) : 0,
      totalQty: totalQty,
      pickedQty: pickedQty,
      finishedQty: finishedQty,
      totalAmount: Number(contract.totalAmount),
      depositRate: Number(contract.depositRate),
      depositAmount: Number(contract.depositAmount),
      depositPaid: Number(contract.depositPaid),
      tailPeriodDays: contract.tailPeriodDays,
      deliveryDate: contract.deliveryDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[contract.status],
      contractVoucher: parseContractVoucher(contract.contractVoucher),
      totalPaid: Number(contract.totalPaid),
      totalOwed: Number(contract.totalOwed),
      relatedOrderIds: contract.relatedOrderIds || [],
      relatedOrderNumbers: contract.relatedOrderNumbers || [],
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString()
    })
  } catch (error: any) {
    console.error('Error fetching purchase contract:', error)
    return NextResponse.json(
      { error: '获取采购合同失败', details: error.message },
      { status: 500 }
    )
  }
}

// PUT - 更新采购合同
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.supplierId !== undefined) updateData.supplierId = body.supplierId || null
    if (body.supplierName !== undefined) updateData.supplierName = body.supplierName
    if (body.depositRate !== undefined) updateData.depositRate = Number(body.depositRate)
    if (body.depositPaid !== undefined) updateData.depositPaid = Number(body.depositPaid)
    if (body.tailPeriodDays !== undefined) updateData.tailPeriodDays = Number(body.tailPeriodDays)
    if (body.deliveryDate !== undefined) updateData.deliveryDate = body.deliveryDate ? new Date(body.deliveryDate) : null
    if (body.status !== undefined) updateData.status = STATUS_MAP_FRONT_TO_DB[body.status] || PurchaseContractStatus.PENDING_SHIPMENT
    if (body.contractVoucher !== undefined) {
      const v = body.contractVoucher
      updateData.contractVoucher =
        v == null || v === ''
          ? null
          : Array.isArray(v)
            ? JSON.stringify(v)
            : String(v).trim() || null
    }
    if (body.totalPaid !== undefined) updateData.totalPaid = Number(body.totalPaid)
    if (body.totalOwed !== undefined) updateData.totalOwed = Number(body.totalOwed)
    if (body.relatedOrderIds !== undefined) updateData.relatedOrderIds = body.relatedOrderIds || []
    if (body.relatedOrderNumbers !== undefined) updateData.relatedOrderNumbers = body.relatedOrderNumbers || []

    const contract = await prisma.purchaseContract.update({
      where: { id: params.id },
      data: updateData,
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: true
              }
            }
          }
        }
      }
    })

    const totalQty = contract.items.reduce((sum, item) => sum + item.qty, 0)
    const pickedQty = contract.items.reduce((sum, item) => sum + item.pickedQty, 0)
    const finishedQty = contract.items.reduce((sum, item) => sum + item.finishedQty, 0)
    const firstItem = contract.items[0]

    return NextResponse.json({
      id: contract.id,
      contractNumber: contract.contractNumber,
      supplierId: contract.supplierId || '',
      supplierName: contract.supplierName,
      sku: firstItem ? `${firstItem.variant?.skuId || firstItem.sku} / ${firstItem.sku}` : '',
      skuId: firstItem?.variant?.skuId || undefined,
      unitPrice: firstItem ? Number(firstItem.unitPrice) : 0,
      totalQty: totalQty,
      pickedQty: pickedQty,
      finishedQty: finishedQty,
      totalAmount: Number(contract.totalAmount),
      depositRate: Number(contract.depositRate),
      depositAmount: Number(contract.depositAmount),
      depositPaid: Number(contract.depositPaid),
      tailPeriodDays: contract.tailPeriodDays,
      deliveryDate: contract.deliveryDate?.toISOString() || undefined,
      status: STATUS_MAP_DB_TO_FRONT[contract.status],
      contractVoucher: parseContractVoucher(contract.contractVoucher),
      totalPaid: Number(contract.totalPaid),
      totalOwed: Number(contract.totalOwed),
      relatedOrderIds: contract.relatedOrderIds || [],
      relatedOrderNumbers: contract.relatedOrderNumbers || [],
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString()
    })
  } catch (error: any) {
    console.error('Error updating purchase contract:', error)
    return NextResponse.json(
      { error: '更新采购合同失败', details: error.message },
      { status: 500 }
    )
  }
}

// DELETE - 删除采购合同
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.purchaseContract.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting purchase contract:', error)
    return NextResponse.json(
      { error: '删除采购合同失败', details: error.message },
      { status: 500 }
    )
  }
}
