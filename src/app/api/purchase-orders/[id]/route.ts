import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { PurchaseOrderStatus, Platform } from '@prisma/client'
import type { PurchaseOrderStatus as FrontendPurchaseOrderStatus } from '@/lib/purchase-orders-store'

export const dynamic = 'force-dynamic'

const statusMap: Record<PurchaseOrderStatus, string> = {
  PENDING_RISK: '待风控',
  RISK_APPROVED: '风控通过',
  RISK_REJECTED: '风控拒绝',
  PENDING_APPROVAL: '待审批',
  APPROVED: '审批通过',
  REJECTED: '审批拒绝',
  PUSHED_TO_PROCUREMENT: '已推送采购',
  CONTRACT_CREATED: '已创建合同',
  CANCELLED: '已取消'
}

function toFrontend(po: any) {
  return {
    id: po.id,
    orderNumber: po.orderNumber,
    uid: po.uid || undefined,
    createdBy: po.createdBy,
    platform: po.platform === 'TIKTOK' ? 'TikTok' as const : po.platform === 'AMAZON' ? 'Amazon' as const : '其他' as const,
    storeId: po.storeId || undefined,
    storeName: po.storeName || undefined,
    sku: po.sku,
    skuId: po.skuId || undefined,
    productName: po.productName || undefined,
    quantity: po.quantity,
    expectedDeliveryDate: po.expectedDeliveryDate?.toISOString?.() || undefined,
    urgency: po.urgency || '普通',
    notes: po.notes || undefined,
    riskControlStatus: po.riskControlStatus || '待评估',
    riskControlBy: po.riskControlBy || undefined,
    riskControlAt: po.riskControlAt?.toISOString?.() || undefined,
    riskControlNotes: po.riskControlNotes || undefined,
    riskControlSnapshot: po.riskControlSnapshot ? JSON.parse(JSON.stringify(po.riskControlSnapshot)) : undefined,
    approvalStatus: po.approvalStatus || '待审批',
    approvedBy: po.approvedBy || undefined,
    approvedAt: po.approvedAt?.toISOString?.() || undefined,
    approvalNotes: po.approvalNotes || undefined,
    pushedToProcurementAt: po.pushedToProcurementAt?.toISOString?.() || undefined,
    pushedBy: po.pushedBy || undefined,
    procurementNotes: po.procurementNotes || undefined,
    relatedContractId: po.contractId || undefined,
    relatedContractNumber: po.contract?.contractNumber || undefined,
    status: (statusMap[po.status as PurchaseOrderStatus] || '待风控') as FrontendPurchaseOrderStatus,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString()
  }
}

// GET - 获取单个采购订单
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: { store: true, contract: true }
    })
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(toFrontend(po))
  } catch (error) {
    console.error('Error fetching purchase order:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

// PUT - 更新采购订单
export async function PUT(
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

    const { id } = params
    const body = await request.json()

    // 状态映射：中文状态 -> Prisma 枚举
    const statusValueMap: Record<string, PurchaseOrderStatus> = {
      '待风控': PurchaseOrderStatus.PENDING_RISK,
      '风控通过': PurchaseOrderStatus.RISK_APPROVED,
      '风控拒绝': PurchaseOrderStatus.RISK_REJECTED,
      '待审批': PurchaseOrderStatus.PENDING_APPROVAL,
      '审批通过': PurchaseOrderStatus.APPROVED,
      '审批拒绝': PurchaseOrderStatus.REJECTED,
      '已推送采购': PurchaseOrderStatus.PUSHED_TO_PROCUREMENT,
      '已创建合同': PurchaseOrderStatus.CONTRACT_CREATED,
      '已取消': PurchaseOrderStatus.CANCELLED
    }

    // 构建更新数据对象，只包含提供的字段
    const updateData: any = {
      updatedAt: new Date()
    }

    if (body.uid !== undefined) updateData.uid = body.uid || null
    if (body.createdBy !== undefined) updateData.createdBy = body.createdBy
    if (body.platform !== undefined) updateData.platform = body.platform === 'TikTok' ? Platform.TIKTOK : body.platform === 'Amazon' ? Platform.AMAZON : Platform.OTHER
    if (body.storeId !== undefined) updateData.storeId = body.storeId || null
    if (body.storeName !== undefined) updateData.storeName = body.storeName || null
    if (body.sku !== undefined) updateData.sku = body.sku
    if (body.skuId !== undefined) updateData.skuId = body.skuId || null
    if (body.productName !== undefined) updateData.productName = body.productName || null
    if (body.quantity !== undefined) updateData.quantity = Number(body.quantity)
    if (body.expectedDeliveryDate !== undefined) updateData.expectedDeliveryDate = body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null
    if (body.urgency !== undefined) updateData.urgency = body.urgency
    if (body.notes !== undefined) updateData.notes = body.notes || null
    if (body.riskControlStatus !== undefined) updateData.riskControlStatus = body.riskControlStatus
    if (body.riskControlBy !== undefined) updateData.riskControlBy = body.riskControlBy || null
    if (body.riskControlAt !== undefined) updateData.riskControlAt = body.riskControlAt ? new Date(body.riskControlAt) : null
    if (body.riskControlNotes !== undefined) updateData.riskControlNotes = body.riskControlNotes || null
    if (body.riskControlSnapshot !== undefined) updateData.riskControlSnapshot = body.riskControlSnapshot ? JSON.parse(JSON.stringify(body.riskControlSnapshot)) : null
    if (body.approvalStatus !== undefined) updateData.approvalStatus = body.approvalStatus
    if (body.approvedBy !== undefined) updateData.approvedBy = body.approvedBy || null
    if (body.approvedAt !== undefined) updateData.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null
    if (body.approvalNotes !== undefined) updateData.approvalNotes = body.approvalNotes || null
    if (body.pushedToProcurementAt !== undefined) updateData.pushedToProcurementAt = body.pushedToProcurementAt ? new Date(body.pushedToProcurementAt) : null
    if (body.pushedBy !== undefined) updateData.pushedBy = body.pushedBy || null
    if (body.procurementNotes !== undefined) updateData.procurementNotes = body.procurementNotes || null
    if (body.contractId !== undefined) updateData.contractId = body.contractId || null
    if (body.relatedContractId !== undefined) updateData.contractId = body.relatedContractId || null
    if (body.status !== undefined) {
      updateData.status = statusValueMap[body.status] || (body.status as PurchaseOrderStatus)
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        store: true,
        contract: true
      }
    })

    const transformed = {
      id: updated.id,
      orderNumber: updated.orderNumber,
      uid: updated.uid || undefined,
      createdBy: updated.createdBy,
      platform: updated.platform === 'TIKTOK' ? 'TikTok' as const : updated.platform === 'AMAZON' ? 'Amazon' as const : '其他' as const,
      storeId: updated.storeId || undefined,
      storeName: updated.storeName || undefined,
      sku: updated.sku,
      skuId: updated.skuId || undefined,
      productName: updated.productName || undefined,
      quantity: updated.quantity,
      expectedDeliveryDate: updated.expectedDeliveryDate?.toISOString() || undefined,
      urgency: updated.urgency || '普通',
      notes: updated.notes || undefined,
      riskControlStatus: updated.riskControlStatus || '待评估',
      riskControlBy: updated.riskControlBy || undefined,
      riskControlAt: updated.riskControlAt?.toISOString() || undefined,
      riskControlNotes: updated.riskControlNotes || undefined,
      riskControlSnapshot: updated.riskControlSnapshot ? JSON.parse(JSON.stringify(updated.riskControlSnapshot)) : undefined,
      approvalStatus: updated.approvalStatus || '待审批',
      approvedBy: updated.approvedBy || undefined,
      approvedAt: updated.approvedAt?.toISOString() || undefined,
      approvalNotes: updated.approvalNotes || undefined,
      pushedToProcurementAt: updated.pushedToProcurementAt?.toISOString() || undefined,
      pushedBy: updated.pushedBy || undefined,
      procurementNotes: updated.procurementNotes || undefined,
      relatedContractId: updated.contractId || undefined,
      relatedContractNumber: updated.contract?.contractNumber || undefined,
      status: (statusMap[updated.status as PurchaseOrderStatus] || '待风控') as FrontendPurchaseOrderStatus,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }

    return NextResponse.json(transformed)
  } catch (error) {
    console.error(`Error updating purchase order ${params.id}:`, error)
    return NextResponse.json(
      { error: `Failed to update purchase order ${params.id}` },
      { status: 500 }
    )
  }
}

// DELETE - 删除采购订单
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

    const { id } = params

    await prisma.purchaseOrder.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Purchase order deleted successfully' })
  } catch (error) {
    console.error(`Error deleting purchase order ${params.id}:`, error)
    return NextResponse.json(
      { error: `Failed to delete purchase order ${params.id}` },
      { status: 500 }
    )
  }
}