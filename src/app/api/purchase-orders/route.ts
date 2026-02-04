import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PurchaseOrderStatus, Platform } from '@prisma/client'
import type { PurchaseOrderStatus as FrontendPurchaseOrderStatus } from '@/lib/purchase-orders-store'

// GET - 获取所有采购订单
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const platform = searchParams.get('platform')
    const createdBy = searchParams.get('createdBy')

    const where: any = {}
    if (status) where.status = status as PurchaseOrderStatus
    if (platform) where.platform = platform as Platform
    if (createdBy) where.createdBy = createdBy

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        store: true,
        contract: true,
        items: { orderBy: { sortOrder: 'asc' } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // 状态映射：Prisma 枚举 -> 中文状态
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

    // 转换格式以匹配前端 PurchaseOrder 类型（兼容单行与多行 items）
    const transformed = purchaseOrders.map(po => {
      const firstItem = po.items?.[0]
      return {
      id: po.id,
      orderNumber: po.orderNumber,
      uid: po.uid || undefined,
      createdBy: po.createdBy,
      platform: po.platform === 'TIKTOK' ? 'TikTok' as const : po.platform === 'AMAZON' ? 'Amazon' as const : '其他' as const,
      storeId: po.storeId || undefined,
      storeName: po.storeName || undefined,
      sku: po.sku ?? firstItem?.sku ?? '',
      skuId: po.skuId ?? firstItem?.skuId ?? undefined,
      productName: po.productName ?? firstItem?.skuName ?? undefined,
      quantity: po.quantity ?? (firstItem ? Number(firstItem.quantity) : 0),
      items: (po.items || []).map(it => ({
        id: it.id,
        sku: it.sku,
        skuId: it.skuId ?? undefined,
        skuName: it.skuName ?? undefined,
        spec: it.spec ?? undefined,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        totalAmount: Number(it.totalAmount),
        sortOrder: it.sortOrder
      })),
      expectedDeliveryDate: po.expectedDeliveryDate?.toISOString() || undefined,
      urgency: po.urgency || '普通',
      notes: po.notes || undefined,
      riskControlStatus: po.riskControlStatus || '待评估',
      riskControlBy: po.riskControlBy || undefined,
      riskControlAt: po.riskControlAt?.toISOString() || undefined,
      riskControlNotes: po.riskControlNotes || undefined,
      riskControlSnapshot: po.riskControlSnapshot ? JSON.parse(JSON.stringify(po.riskControlSnapshot)) : undefined,
      approvalStatus: po.approvalStatus || '待审批',
      approvedBy: po.approvedBy || undefined,
      approvedAt: po.approvedAt?.toISOString() || undefined,
      approvalNotes: po.approvalNotes || undefined,
      pushedToProcurementAt: po.pushedToProcurementAt?.toISOString() || undefined,
      pushedBy: po.pushedBy || undefined,
      procurementNotes: po.procurementNotes || undefined,
      relatedContractId: po.contractId || undefined,
      relatedContractNumber: po.contract?.contractNumber || undefined,
      status: (statusMap[po.status] || '待风控') as FrontendPurchaseOrderStatus,
      createdAt: po.createdAt.toISOString(),
      updatedAt: po.updatedAt.toISOString()
    }
    })
    )

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching purchase orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch purchase orders' },
      { status: 500 }
    )
  }
}

// POST - 创建新采购订单
export async function POST(request: NextRequest) {
  try {
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

    // 生成订单编号（如果未提供）
    const orderNumber = body.orderNumber || (() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      const timestamp = now.getTime();
      return `PO-${year}${month}${day}-${String(timestamp).slice(-6)}`;
    })()

    const itemsInput = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [{ sku: body.sku, skuId: body.skuId, skuName: body.productName, spec: null, quantity: Number(body.quantity), unitPrice: body.unitPrice != null ? Number(body.unitPrice) : 0 }]
    const firstInput = itemsInput[0]
    const totalQty = itemsInput.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0)

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        orderNumber,
        uid: body.uid || null,
        createdBy: body.createdBy,
        platform: body.platform === 'TikTok' ? Platform.TIKTOK : body.platform === 'Amazon' ? Platform.AMAZON : Platform.OTHER,
        storeId: body.storeId || null,
        storeName: body.storeName || null,
        sku: firstInput?.sku ?? body.sku ?? null,
        skuId: firstInput?.skuId ?? body.skuId ?? null,
        productName: firstInput?.skuName ?? body.productName ?? null,
        quantity: totalQty || Number(body.quantity) || null,
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
        urgency: body.urgency,
        notes: body.notes || null,
        riskControlStatus: body.riskControlStatus || '待评估',
        riskControlBy: body.riskControlBy || null,
        riskControlAt: body.riskControlAt ? new Date(body.riskControlAt) : null,
        riskControlNotes: body.riskControlNotes || null,
        riskControlSnapshot: body.riskControlSnapshot ? JSON.parse(JSON.stringify(body.riskControlSnapshot)) : null,
        approvalStatus: body.approvalStatus || '待审批',
        approvedBy: body.approvedBy || null,
        approvedAt: body.approvedAt ? new Date(body.approvedAt) : null,
        approvalNotes: body.approvalNotes || null,
        pushedToProcurementAt: body.pushedToProcurementAt ? new Date(body.pushedToProcurementAt) : null,
        pushedBy: body.pushedBy || null,
        procurementNotes: body.procurementNotes || null,
        contractId: body.contractId || body.relatedContractId || null,
        status: statusValueMap[body.status] || PurchaseOrderStatus.PENDING_RISK,
        items: {
          create: itemsInput.map((it: any, idx: number) => {
            const qty = Number(it.quantity) || 0
            const unitPrice = Number(it.unitPrice) || 0
            const totalAmount = qty * unitPrice
            return {
              sku: it.sku || '',
              skuId: it.skuId || null,
              skuName: it.skuName || null,
              spec: it.spec || null,
              quantity: qty,
              unitPrice,
              totalAmount,
              sortOrder: idx
            }
          })
        }
      },
      include: {
        store: true,
        contract: true,
        items: { orderBy: { sortOrder: 'asc' } }
      }
    })

    // 状态映射：Prisma 枚举 -> 中文状态
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

    const firstItem = purchaseOrder.items?.[0]
    const transformed = {
      id: purchaseOrder.id,
      orderNumber: purchaseOrder.orderNumber,
      uid: purchaseOrder.uid || undefined,
      createdBy: purchaseOrder.createdBy,
      platform: purchaseOrder.platform === 'TIKTOK' ? 'TikTok' as const : purchaseOrder.platform === 'AMAZON' ? 'Amazon' as const : '其他' as const,
      storeId: purchaseOrder.storeId || undefined,
      storeName: purchaseOrder.storeName || undefined,
      sku: purchaseOrder.sku ?? firstItem?.sku ?? '',
      skuId: purchaseOrder.skuId ?? firstItem?.skuId ?? undefined,
      productName: purchaseOrder.productName ?? firstItem?.skuName ?? undefined,
      quantity: purchaseOrder.quantity ?? (firstItem ? Number(firstItem.quantity) : 0),
      items: (purchaseOrder.items || []).map(it => ({
        id: it.id,
        sku: it.sku,
        skuId: it.skuId ?? undefined,
        skuName: it.skuName ?? undefined,
        spec: it.spec ?? undefined,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
        totalAmount: Number(it.totalAmount),
        sortOrder: it.sortOrder
      })),
      expectedDeliveryDate: purchaseOrder.expectedDeliveryDate?.toISOString() || undefined,
      urgency: purchaseOrder.urgency || '普通',
      notes: purchaseOrder.notes || undefined,
      riskControlStatus: purchaseOrder.riskControlStatus || '待评估',
      riskControlBy: purchaseOrder.riskControlBy || undefined,
      riskControlAt: purchaseOrder.riskControlAt?.toISOString() || undefined,
      riskControlNotes: purchaseOrder.riskControlNotes || undefined,
      riskControlSnapshot: purchaseOrder.riskControlSnapshot ? JSON.parse(JSON.stringify(purchaseOrder.riskControlSnapshot)) : undefined,
      approvalStatus: purchaseOrder.approvalStatus || '待审批',
      approvedBy: purchaseOrder.approvedBy || undefined,
      approvedAt: purchaseOrder.approvedAt?.toISOString() || undefined,
      approvalNotes: purchaseOrder.approvalNotes || undefined,
      pushedToProcurementAt: purchaseOrder.pushedToProcurementAt?.toISOString() || undefined,
      pushedBy: purchaseOrder.pushedBy || undefined,
      procurementNotes: purchaseOrder.procurementNotes || undefined,
      relatedContractId: purchaseOrder.contractId || undefined,
      relatedContractNumber: purchaseOrder.contract?.contractNumber || undefined,
      status: (statusMap[purchaseOrder.status] || '待风控') as FrontendPurchaseOrderStatus,
      createdAt: purchaseOrder.createdAt.toISOString(),
      updatedAt: purchaseOrder.updatedAt.toISOString()
    }

    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error('Error creating purchase order:', error)
    return NextResponse.json(
      { error: 'Failed to create purchase order' },
      { status: 500 }
    )
  }
}