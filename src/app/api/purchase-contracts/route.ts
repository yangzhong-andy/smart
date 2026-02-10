import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PurchaseContractStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// 状态映射：Prisma 枚举 -> 中文状态
const STATUS_MAP_DB_TO_FRONT: Record<PurchaseContractStatus, string> = {
  PENDING_APPROVAL: '待审批',
  PENDING_SHIPMENT: '待发货',
  PARTIAL_SHIPMENT: '部分发货',
  SHIPPED: '发货完成',
  SETTLED: '已结清',
  CANCELLED: '已取消'
}

// 状态映射：中文状态 -> Prisma 枚举
const STATUS_MAP_FRONT_TO_DB: Record<string, PurchaseContractStatus> = {
  '待审批': PurchaseContractStatus.PENDING_APPROVAL,
  '待发货': PurchaseContractStatus.PENDING_SHIPMENT,
  '部分发货': PurchaseContractStatus.PARTIAL_SHIPMENT,
  '发货完成': PurchaseContractStatus.SHIPPED,
  '已结清': PurchaseContractStatus.SETTLED,
  '已取消': PurchaseContractStatus.CANCELLED
}

// 合同凭证从 DB 读出时可能是 JSON 字符串（多图），解析为 string | string[] 供前端
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

// 从定金支出申请摘要中解析合同编号（兼容多种分隔符）
function parseContractNumberFromDepositSummary(summary: string): string | null {
  if (!summary || !summary.includes('采购合同定金')) return null
  const num = summary.replace(/^采购合同定金\s*[-\－:：]\s*/i, '').trim()
    || summary.replace('采购合同定金', '').trim()
  return num || null
}

// GET - 获取所有采购合同
export async function GET(request: NextRequest) {
  try {
    const contracts = await prisma.purchaseContract.findMany({
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
      },
      orderBy: { createdAt: 'desc' }
    })

    // 自动同步：查出已支付但合同未更新的定金，在返回前补写合同并用于本次响应
    const paidDeposits = await prisma.expenseRequest.findMany({
      where: { status: 'Paid', summary: { contains: '采购合同定金' } }
    })
    const depositByContractNumber: Record<string, number> = {}
    for (const req of paidDeposits) {
      const cn = parseContractNumberFromDepositSummary(req.summary)
      if (cn && Number.isFinite(Number(req.amount))) {
        const amt = Number(req.amount)
        depositByContractNumber[cn] = (depositByContractNumber[cn] || 0) + amt
      }
    }

    const contractUpdates: Array<{ id: string; depositPaid: number; totalPaid: number; totalOwed: number; status: string }> = []
    for (const c of contracts) {
      const currentDeposit = Number(c.depositPaid)
      const currentTotalPaid = Number(c.totalPaid)
      const amount = depositByContractNumber[c.contractNumber]
      if (currentDeposit === 0 && amount != null && amount > 0) {
        const totalAmount = Number(c.totalAmount)
        const newTotalPaid = currentTotalPaid + amount
        const newTotalOwed = totalAmount - newTotalPaid
        contractUpdates.push({
          id: c.id,
          depositPaid: amount,
          totalPaid: newTotalPaid,
          totalOwed: newTotalOwed,
          status: newTotalPaid >= totalAmount ? 'SETTLED' : c.status
        })
      }
    }
    for (const u of contractUpdates) {
      await prisma.purchaseContract.update({
        where: { id: u.id },
        data: {
          depositPaid: u.depositPaid,
          totalPaid: u.totalPaid,
          totalOwed: u.totalOwed,
          status: u.status as any,
          updatedAt: new Date()
        }
      })
    }
    const updatedById = new Map(contractUpdates.map(u => [u.id, u]))

    // 转换格式以匹配前端 PurchaseContract 类型
    const transformed = contracts.map(contract => {
      const updated = updatedById.get(contract.id)
      const depositPaid = updated ? updated.depositPaid : Number(contract.depositPaid)
      const totalPaid = updated ? updated.totalPaid : Number(contract.totalPaid)
      const totalOwed = updated ? updated.totalOwed : Number(contract.totalOwed)
      const status = updated ? (updated.status === 'SETTLED' ? '已结清' : STATUS_MAP_DB_TO_FRONT[contract.status as keyof typeof STATUS_MAP_DB_TO_FRONT]) : (STATUS_MAP_DB_TO_FRONT[contract.status] || contract.status)
      // 计算总数量和已取货数（从 items 汇总）
      const totalQty = contract.items.reduce((sum, item) => sum + item.qty, 0)
      const pickedQty = contract.items.reduce((sum, item) => sum + item.pickedQty, 0)
      const finishedQty = contract.items.reduce((sum, item) => sum + item.finishedQty, 0)

      // 获取第一个 SKU 项的信息（向后兼容单 SKU 合同）
      const firstItem = contract.items[0]
      const sku = firstItem ? `${firstItem.variant?.skuId || firstItem.sku} / ${firstItem.sku}` : ''
      const skuId = firstItem?.variant?.skuId || undefined
      const unitPrice = firstItem ? Number(firstItem.unitPrice) : 0

      return {
        id: contract.id,
        contractNumber: contract.contractNumber,
        supplierId: contract.supplierId || '',
        supplierName: contract.supplierName,
        sku: sku,
        skuId: skuId,
        unitPrice: unitPrice,
        totalQty: totalQty,
        pickedQty: pickedQty,
        finishedQty: finishedQty,
        totalAmount: Number(contract.totalAmount),
        depositRate: Number(contract.depositRate),
        depositAmount: Number(contract.depositAmount),
        depositPaid,
        tailPeriodDays: contract.tailPeriodDays,
        deliveryDate: contract.deliveryDate ? contract.deliveryDate.toISOString() : undefined,
        status,
        contractVoucher: parseContractVoucher(contract.contractVoucher),
        totalPaid,
        totalOwed,
        relatedOrderIds: contract.relatedOrderIds || [],
        relatedOrderNumbers: contract.relatedOrderNumbers || [],
        approvedBy: contract.approvedBy ?? undefined,
        approvedAt: contract.approvedAt?.toISOString() ?? undefined,
        approvalNotes: contract.approvalNotes ?? undefined,
        createdAt: contract.createdAt.toISOString(),
        updatedAt: contract.updatedAt.toISOString(),
        relatedOrderId: contract.relatedOrderIds[0] || undefined,
        relatedOrderNumber: contract.relatedOrderNumbers[0] || undefined,
        // 合同明细（多 SKU/变体），供列表与详情展示，带 SPU 信息
        items: contract.items.map((item) => ({
          id: item.id,
          variantId: item.variantId ?? undefined,
          sku: item.sku,
          variantSkuId: item.variant?.skuId ?? item.sku,
          skuName: item.skuName ?? undefined,
          spec: item.spec ?? undefined,
          unitPrice: Number(item.unitPrice),
          qty: item.qty,
          pickedQty: item.pickedQty,
          finishedQty: item.finishedQty,
          totalAmount: Number(item.totalAmount),
          sortOrder: item.sortOrder,
          spuName: item.variant?.product?.name ?? undefined,
          spuId: item.variant?.product?.id ?? undefined,
        })),
      }
    })

    return NextResponse.json(transformed)
  } catch (error: any) {
    console.error('Error fetching purchase contracts:', error)
    return NextResponse.json(
      { error: '获取采购合同失败', details: error.message },
      { status: 500 }
    )
  }
}

// POST - 创建新采购合同
export async function POST(request: NextRequest) {
  try {
    // 数据库连接重试逻辑
    let retries = 3
    while (retries > 0) {
      try {
        await prisma.$connect()
        break
      } catch (error: any) {
        retries--
        if (retries === 0) {
          console.error('数据库连接失败:', error)
          return NextResponse.json(
            { error: '数据库连接失败，请检查 Neon 数据库是否已唤醒' },
            { status: 503 }
          )
        }
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    const body = await request.json()

    // 验证必填字段
    if (!body.contractNumber) {
      return NextResponse.json(
        { error: '合同编号是必填项' },
        { status: 400 }
      )
    }

    if (!body.supplierName) {
      return NextResponse.json(
        { error: '供应商名称是必填项' },
        { status: 400 }
      )
    }

    const itemsInput = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [{ sku: body.sku, skuId: body.skuId, skuName: body.skuName, spec: body.spec, quantity: Number(body.totalQty), unitPrice: Number(body.unitPrice) }]

    const firstInput = itemsInput[0]
    if (!firstInput?.sku || firstInput.unitPrice == null || !firstInput.quantity) {
      return NextResponse.json(
        { error: '至少需要一条物料：SKU、单价和数量为必填项' },
        { status: 400 }
      )
    }

    const totalAmount = itemsInput.reduce((sum: number, it: any) => {
      const qty = Number(it.quantity) || 0
      const up = Number(it.unitPrice) || 0
      return sum + qty * up
    }, 0)
    const depositRate = Number(body.depositRate) || 0
    const depositAmount = (totalAmount * depositRate) / 100
    const totalQty = Math.round(itemsInput.reduce((s: number, it: any) => s + (Number(it.quantity) || 0), 0))

    // 合同凭证：数据库为 String，前端可能传 string 或 string[]，统一转为 string 存储
    const contractVoucherStr =
      body.contractVoucher == null
        ? null
        : Array.isArray(body.contractVoucher)
          ? JSON.stringify(body.contractVoucher)
          : String(body.contractVoucher).trim() || null

    const resolveVariantId = async (skuId: string | undefined) => {
      if (!skuId) return null
      const variant = await prisma.productVariant.findUnique({ where: { skuId } })
      return variant?.id ?? null
    }

    // 新建合同默认「待审批」；若 Prisma 客户端未含 PENDING_APPROVAL 则用字符串兜底
    const createStatus: PurchaseContractStatus =
      STATUS_MAP_FRONT_TO_DB[body.status] ??
      PurchaseContractStatus.PENDING_APPROVAL ??
      ('PENDING_APPROVAL' as PurchaseContractStatus)

    const contract = await prisma.purchaseContract.create({
      data: {
        contractNumber: body.contractNumber,
        supplierId: body.supplierId || null,
        supplierName: body.supplierName,
        sku: firstInput.sku,
        skuId: firstInput.skuId || null,
        unitPrice: Number(firstInput.unitPrice),
        totalQty,
        pickedQty: 0,
        finishedQty: 0,
        totalAmount,
        depositRate,
        depositAmount,
        depositPaid: 0,
        tailPeriodDays: Math.round(Number(body.tailPeriodDays) || 0),
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        status: createStatus,
        contractVoucher: contractVoucherStr,
        totalPaid: 0,
        totalOwed: totalAmount,
        relatedOrderIds: body.relatedOrderIds || [],
        relatedOrderNumbers: body.relatedOrderNumbers || [],
        items: {
          create: await Promise.all(itemsInput.map(async (it: any, idx: number) => {
            const qty = Math.round(Number(it.quantity) || 0)
            const unitPrice = Number(it.unitPrice) || 0
            const lineTotal = qty * unitPrice
            const variantId = await resolveVariantId(it.skuId || it.variantId)
            const itemData: any = {
              sku: it.sku,
              skuName: it.skuName || null,
              spec: it.spec || null,
              unitPrice,
              qty,
              pickedQty: 0,
              finishedQty: 0,
              totalAmount: lineTotal,
              sortOrder: idx
            }
            if (variantId) itemData.variant = { connect: { id: variantId } }
            return itemData
          }))
        }
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
        }
      }
    })

    // 转换格式（多行时 totalQty 用合同汇总值）
    const firstItem = contract.items[0]
    const totalQtyFromItems = contract.items.reduce((s, i) => s + i.qty, 0)
    const transformed = {
      id: contract.id,
      contractNumber: contract.contractNumber,
      supplierId: contract.supplierId || '',
      supplierName: contract.supplierName,
      sku: firstItem ? `${firstItem.sku}${contract.items.length > 1 ? ` 等${contract.items.length}项` : ''}` : (body.sku || ''),
      skuId: firstItem?.variantId || body.skuId || undefined,
      unitPrice: Number(firstItem?.unitPrice || body.unitPrice),
      totalQty: totalQtyFromItems,
      pickedQty: 0,
      finishedQty: 0,
      totalAmount: Number(contract.totalAmount),
      depositRate: Number(contract.depositRate),
      depositAmount: Number(contract.depositAmount),
      depositPaid: 0,
      tailPeriodDays: contract.tailPeriodDays,
      deliveryDate: contract.deliveryDate ? contract.deliveryDate.toISOString() : undefined,
      status: STATUS_MAP_DB_TO_FRONT[contract.status],
      contractVoucher: parseContractVoucher(contract.contractVoucher),
      totalPaid: 0,
      totalOwed: Number(contract.totalOwed),
      relatedOrderIds: contract.relatedOrderIds || [],
      relatedOrderNumbers: contract.relatedOrderNumbers || [],
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString()
    }

    return NextResponse.json(transformed, { status: 201 })
  } catch (error: any) {
    console.error('Error creating purchase contract:', error)
    
    // 处理唯一约束错误
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '合同编号已存在' },
        { status: 409 }
      )
    }

    const message = error?.message || '未知错误'
    return NextResponse.json(
      { error: '创建采购合同失败', details: message },
      { status: 500 }
    )
  }
}
