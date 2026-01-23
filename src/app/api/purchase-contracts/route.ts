import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PurchaseContractStatus } from '@prisma/client'

// 状态映射：Prisma 枚举 -> 中文状态
const STATUS_MAP_DB_TO_FRONT: Record<PurchaseContractStatus, string> = {
  PENDING_SHIPMENT: '待发货',
  PARTIAL_SHIPMENT: '部分发货',
  SHIPPED: '发货完成',
  SETTLED: '已结清',
  CANCELLED: '已取消'
}

// 状态映射：中文状态 -> Prisma 枚举
const STATUS_MAP_FRONT_TO_DB: Record<string, PurchaseContractStatus> = {
  '待发货': PurchaseContractStatus.PENDING_SHIPMENT,
  '部分发货': PurchaseContractStatus.PARTIAL_SHIPMENT,
  '发货完成': PurchaseContractStatus.SHIPPED,
  '已结清': PurchaseContractStatus.SETTLED,
  '已取消': PurchaseContractStatus.CANCELLED
}

// GET - 获取所有采购合同
export async function GET(request: NextRequest) {
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

    // 转换格式以匹配前端 PurchaseContract 类型
    const transformed = contracts.map(contract => {
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
        depositPaid: Number(contract.depositPaid),
        tailPeriodDays: contract.tailPeriodDays,
        deliveryDate: contract.deliveryDate ? contract.deliveryDate.toISOString() : undefined,
        status: STATUS_MAP_DB_TO_FRONT[contract.status] || contract.status,
        contractVoucher: contract.contractVoucher || undefined,
        totalPaid: Number(contract.totalPaid),
        totalOwed: Number(contract.totalOwed),
        relatedOrderIds: contract.relatedOrderIds || [],
        relatedOrderNumbers: contract.relatedOrderNumbers || [],
        createdAt: contract.createdAt.toISOString(),
        updatedAt: contract.updatedAt.toISOString(),
        // 向后兼容字段
        relatedOrderId: contract.relatedOrderIds[0] || undefined,
        relatedOrderNumber: contract.relatedOrderNumbers[0] || undefined
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

    if (!body.sku || !body.unitPrice || !body.totalQty) {
      return NextResponse.json(
        { error: 'SKU、单价和下单数量是必填项' },
        { status: 400 }
      )
    }

    // 计算合同总额
    const totalAmount = Number(body.unitPrice) * Number(body.totalQty)
    const depositRate = Number(body.depositRate) || 0
    const depositAmount = (totalAmount * depositRate) / 100

    // 如果提供了 skuId，查找对应的 variantId
    let variantId: string | null = null
    if (body.skuId || body.variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { skuId: body.skuId || body.variantId }
      })
      if (variant) {
        variantId = variant.id
      }
    }

    // 创建合同
    // 注意：PurchaseContract 模型中仍需要 sku, unitPrice, totalQty 字段（用于向后兼容）
    // 这些值从第一个 item 中获取
    const contract = await prisma.purchaseContract.create({
      data: {
        contractNumber: body.contractNumber,
        supplierId: body.supplierId || null,
        supplierName: body.supplierName,
        sku: body.sku, // 必需字段，从第一个 item 获取
        skuId: body.skuId || null,
        unitPrice: Number(body.unitPrice), // 必需字段
        totalQty: Number(body.totalQty), // 必需字段
        pickedQty: 0,
        finishedQty: 0,
        totalAmount: totalAmount,
        depositRate: depositRate,
        depositAmount: depositAmount,
        depositPaid: 0,
        tailPeriodDays: Number(body.tailPeriodDays) || 0,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        status: STATUS_MAP_FRONT_TO_DB[body.status] || PurchaseContractStatus.PENDING_SHIPMENT,
        contractVoucher: body.contractVoucher || null,
        totalPaid: 0,
        totalOwed: totalAmount,
        relatedOrderIds: body.relatedOrderIds || [],
        relatedOrderNumbers: body.relatedOrderNumbers || [],
        // 创建合同项
        items: {
          create: {
            sku: body.sku,
            variantId: variantId,
            unitPrice: Number(body.unitPrice),
            qty: Number(body.totalQty),
            pickedQty: 0,
            finishedQty: 0,
            totalAmount: totalAmount
          }
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

    // 转换格式
    const firstItem = contract.items[0]
    const transformed = {
      id: contract.id,
      contractNumber: contract.contractNumber,
      supplierId: contract.supplierId || '',
      supplierName: contract.supplierName,
      sku: body.sku,
      skuId: body.skuId || undefined,
      unitPrice: Number(firstItem?.unitPrice || body.unitPrice),
      totalQty: Number(firstItem?.qty || body.totalQty),
      pickedQty: 0,
      finishedQty: 0,
      totalAmount: Number(contract.totalAmount),
      depositRate: Number(contract.depositRate),
      depositAmount: Number(contract.depositAmount),
      depositPaid: 0,
      tailPeriodDays: contract.tailPeriodDays,
      deliveryDate: contract.deliveryDate ? contract.deliveryDate.toISOString() : undefined,
      status: STATUS_MAP_DB_TO_FRONT[contract.status],
      contractVoucher: contract.contractVoucher || undefined,
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

    return NextResponse.json(
      { error: '创建采购合同失败', details: error.message },
      { status: 500 }
    )
  }
}
