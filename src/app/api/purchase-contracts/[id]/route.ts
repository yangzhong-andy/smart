import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { PurchaseContractStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

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
      updatedAt: contract.updatedAt.toISOString(),
      items: contract.items.map((item) => ({
        id: item.id,
        variantId: item.variantId ?? undefined,
        sku: item.sku,
        skuName: item.skuName ?? undefined,
        spec: item.spec ?? undefined,
        unitPrice: Number(item.unitPrice),
        qty: item.qty,
        pickedQty: item.pickedQty,
        finishedQty: item.finishedQty,
        totalAmount: Number(item.totalAmount),
        sortOrder: item.sortOrder,
        spuName: item.variant?.product?.name ?? undefined,
        spuId: item.variant?.product?.id ?? undefined
      }))
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

// DELETE - 删除采购合同（仅最高管理员 SUPER_ADMIN 可操作）
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: '权限不足，仅最高管理员可删除采购合同' },
        { status: 403 }
      )
    }

    const contract = await prisma.purchaseContract.findUnique({
      where: { id: params.id },
      include: {
        deliveryOrders: { take: 1 },
        generatedContracts: { take: 1 }
      }
    })
    if (!contract) {
      return NextResponse.json({ error: '采购合同不存在' }, { status: 404 })
    }
    if (contract.deliveryOrders.length > 0) {
      return NextResponse.json(
        { error: '该合同下存在拿货单，无法删除。请先删除或处理相关拿货单。' },
        { status: 400 }
      )
    }

    await prisma.purchaseContract.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting purchase contract:', error)
    const code = error?.code
    if (code === 'P2003' || (error?.message && String(error.message).includes('foreign key'))) {
      return NextResponse.json(
        { error: '该合同有关联数据（如拿货单），无法直接删除。请先处理关联数据。' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: '删除采购合同失败', details: error.message },
      { status: 500 }
    )
  }
}
