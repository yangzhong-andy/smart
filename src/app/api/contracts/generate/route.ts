import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { amountToChineseUppercase } from '@/lib/amount-to-chinese'
import { getCompanyInfo } from '@/lib/company'

export type ContractSnapshotItem = {
  sku: string
  skuName?: string
  spec?: string
  productName?: string
  material?: string
  specDescription?: string
  unitPrice: number
  quantity: number
  totalAmount: number
}

/** 甲方（需方/买方）信息，来自本公司配置 */
export type ContractSnapshotBuyer = {
  name: string
  address?: string
  phone?: string
  contact?: string
  bankAccount?: string
  bankAccountName?: string
  bankName?: string
  taxId?: string
}

export type ContractSnapshot = {
  contractNumber: string
  orderNumber?: string
  /** 甲方（需方）：本公司信息 */
  buyer?: ContractSnapshotBuyer
  supplierName: string
  supplierContact?: string
  supplierPhone?: string
  supplierAddress?: string
  supplierBankAccount?: string
  supplierBankName?: string
  supplierTaxId?: string
  orderDate: string // ISO date
  deliveryDate: string // ISO date，下单日期 + 约定工期
  leadTimeDays: number
  items: ContractSnapshotItem[]
  totalAmount: number
  amountUppercase: string
  depositRate?: number
  depositAmount?: number
  tailPeriodDays?: number
}

// POST /api/contracts/generate - 根据采购合同或采购订单生成合同快照
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const purchaseContractId = body.purchaseContractId as string | undefined
    const purchaseOrderId = body.purchaseOrderId as string | undefined

    if (purchaseContractId) {
      return await generateFromPurchaseContract(purchaseContractId)
    }
    if (purchaseOrderId) {
      return await generateFromPurchaseOrder(purchaseOrderId)
    }

    return NextResponse.json(
      { error: '请提供 purchaseContractId 或 purchaseOrderId' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Contract generate error:', error)
    return NextResponse.json(
      { error: error?.message || '生成合同失败' },
      { status: 500 }
    )
  }
}

async function generateFromPurchaseContract(purchaseContractId: string) {
  const contract = await prisma.purchaseContract.findUnique({
    where: { id: purchaseContractId },
    include: {
      supplier: true,
      items: {
        include: {
          variant: { include: { product: true } },
        },
      },
    },
  })
  if (!contract) {
    return NextResponse.json({ error: '采购合同不存在' }, { status: 404 })
  }

  const totalAmount = Number(contract.totalAmount)
  const orderDate = contract.createdAt
  const leadTimeDays = contract.supplier?.defaultLeadTime ?? 7
  const deliveryDate = new Date(orderDate)
  deliveryDate.setDate(deliveryDate.getDate() + leadTimeDays)

  const items: ContractSnapshotItem[] = contract.items.length
    ? contract.items.map((i) => {
        const product = (i as any).variant?.product
        return {
          sku: i.sku,
          skuName: (i as any).skuName ?? undefined,
          spec: (i as any).spec ?? undefined,
          productName: (i as any).skuName ?? undefined,
          material: product?.material ?? undefined,
          specDescription: (product as any)?.specDescription ?? undefined,
          unitPrice: Number(i.unitPrice),
          quantity: i.qty,
          totalAmount: Number(i.totalAmount),
        }
      })
    : [
        {
          sku: contract.sku,
          unitPrice: Number(contract.unitPrice),
          quantity: contract.totalQty,
          totalAmount: totalAmount,
        },
      ]

  const company = getCompanyInfo()
  const snapshot: ContractSnapshot = {
    contractNumber: contract.contractNumber,
    orderNumber: contract.relatedOrderNumbers?.[0],
    buyer: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      contact: company.contact,
      bankAccount: company.bankAccount,
      bankAccountName: company.bankAccountName,
      bankName: company.bankName,
      taxId: company.taxId,
    },
    supplierName: contract.supplierName,
    supplierContact: contract.supplier?.contact ?? undefined,
    supplierPhone: contract.supplier?.phone ?? undefined,
    supplierAddress: contract.supplier?.address ?? undefined,
    supplierBankAccount: contract.supplier?.bankAccount ?? undefined,
    supplierBankName: contract.supplier?.bankName ?? undefined,
    supplierTaxId: contract.supplier?.taxId ?? undefined,
    orderDate: orderDate.toISOString().slice(0, 10),
    deliveryDate: (contract.deliveryDate || deliveryDate).toISOString().slice(0, 10),
    leadTimeDays,
    items,
    totalAmount,
    amountUppercase: amountToChineseUppercase(totalAmount),
    depositRate: Number(contract.depositRate),
    depositAmount: Number(contract.depositAmount),
    tailPeriodDays: contract.tailPeriodDays,
  }

  const generated = await prisma.generatedContract.create({
    data: {
      contractNumber: contract.contractNumber,
      purchaseContractId: contract.id,
      snapshot: snapshot as any,
    },
  })

  return NextResponse.json({
    id: generated.id,
    contractNumber: generated.contractNumber,
    snapshot,
  })
}

async function generateFromPurchaseOrder(purchaseOrderId: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { store: true, items: true },
  })
  if (!order) {
    return NextResponse.json({ error: '采购订单不存在' }, { status: 404 })
  }

  const orderDate = order.createdAt
  const leadTimeDays = 7
  const deliveryDate = new Date(orderDate)
  deliveryDate.setDate(deliveryDate.getDate() + leadTimeDays)

  // 多行订单：使用 OrderItem 列表，补全原型材质/规格（一次查询）
  if (order.items && order.items.length > 0) {
    const skuIds = order.items.map((i: any) => i.skuId || i.sku).filter(Boolean) as string[]
    const variants = skuIds.length > 0
      ? await prisma.productVariant.findMany({
          where: { skuId: { in: skuIds } },
          include: { product: true },
        })
      : []
    const variantBySku = Object.fromEntries(variants.map((v) => [v.skuId, v]))
    const items: ContractSnapshotItem[] = order.items.map((i: any) => {
      const v = variantBySku[i.skuId || i.sku]
      const product = v?.product
      return {
        sku: i.sku,
        skuName: i.skuName ?? undefined,
        spec: i.spec ?? undefined,
        productName: i.skuName ?? undefined,
        material: product?.material ?? undefined,
        specDescription: (product as any)?.specDescription ?? undefined,
        unitPrice: Number(i.unitPrice),
        quantity: i.quantity,
        totalAmount: Number(i.totalAmount ?? 0) || i.quantity * Number(i.unitPrice),
      }
    })
    const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0)
    const company = getCompanyInfo()
    const snapshot: ContractSnapshot = {
      contractNumber: order.orderNumber,
      orderNumber: order.orderNumber,
      buyer: {
        name: company.name,
        address: company.address,
        phone: company.phone,
        contact: company.contact,
        bankAccount: company.bankAccount,
        bankAccountName: company.bankAccountName,
        bankName: company.bankName,
        taxId: company.taxId,
      },
      supplierName: '待指定供应商',
      orderDate: orderDate.toISOString().slice(0, 10),
      deliveryDate: (order.expectedDeliveryDate || deliveryDate).toISOString().slice(0, 10),
      leadTimeDays,
      items,
      totalAmount,
      amountUppercase: amountToChineseUppercase(totalAmount),
    }
    const generated = await prisma.generatedContract.create({
      data: {
        contractNumber: order.orderNumber,
        purchaseOrderId: order.id,
        snapshot: snapshot as any,
      },
    })
    return NextResponse.json({
      id: generated.id,
      contractNumber: generated.contractNumber,
      snapshot,
    })
  }

  // 兼容单 SKU 订单
  const variant =
    (order.skuId
      ? await prisma.productVariant.findFirst({
          where: {
            OR: [
              { id: order.skuId },
              ...(order.sku != null && order.sku !== '' ? [{ skuId: order.sku }] : []),
            ],
          },
          include: {
            product: {
              include: {
                defaultSupplier: true,
                productSuppliers: { include: { supplier: true }, orderBy: { isPrimary: 'desc' } },
              },
            },
          },
        })
      : null) ?? null

  const product = variant?.product
  const ps = product?.productSuppliers?.[0]
  const supplier = product?.defaultSupplier ?? (ps as { supplier: { id: string; name: string; contact?: string; phone?: string; address?: string; bankAccount?: string; bankName?: string; taxId?: string; defaultLeadTime?: number } } | undefined)?.supplier
  const supplierLeadTime = supplier?.defaultLeadTime ?? 7
  const unitPrice = Number(
    (ps as { price?: { toString?: () => string } } | undefined)?.price ??
      (variant?.costPrice != null ? variant.costPrice : 0)
  )
  const totalAmount = (order.quantity ?? 0) * unitPrice
  const deliveryDateSingle = new Date(orderDate)
  deliveryDateSingle.setDate(deliveryDateSingle.getDate() + supplierLeadTime)

  const company = getCompanyInfo()
  const snapshot: ContractSnapshot = {
    contractNumber: order.orderNumber,
    orderNumber: order.orderNumber,
    buyer: {
      name: company.name,
      address: company.address,
      phone: company.phone,
      contact: company.contact,
      bankAccount: company.bankAccount,
      bankAccountName: company.bankAccountName,
      bankName: company.bankName,
      taxId: company.taxId,
    },
    supplierName: supplier?.name ?? '待指定供应商',
    supplierContact: supplier?.contact ?? undefined,
    supplierPhone: supplier?.phone ?? undefined,
    supplierAddress: supplier?.address ?? undefined,
    supplierBankAccount: supplier?.bankAccount ?? undefined,
    supplierBankName: supplier?.bankName ?? undefined,
    supplierTaxId: supplier?.taxId ?? undefined,
    orderDate: orderDate.toISOString().slice(0, 10),
    deliveryDate: (order.expectedDeliveryDate || deliveryDateSingle).toISOString().slice(0, 10),
    leadTimeDays: supplierLeadTime,
    items: [
      {
        sku: order.sku ?? undefined,
        productName: order.productName ?? undefined,
        unitPrice,
        quantity: order.quantity ?? 0,
        totalAmount,
      },
    ],
    totalAmount,
    amountUppercase: amountToChineseUppercase(totalAmount),
  }

  const generated = await prisma.generatedContract.create({
    data: {
      contractNumber: order.orderNumber,
      purchaseOrderId: order.id,
      snapshot: snapshot as any,
    },
  })

  return NextResponse.json({
    id: generated.id,
    contractNumber: generated.contractNumber,
    snapshot,
  })
}
