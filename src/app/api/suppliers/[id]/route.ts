import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/api-response'
import { clearCacheByPrefix } from "@/lib/redis";
import { SettleBase, InvoiceRequirement } from '@prisma/client'
import {
  SETTLE_BASE_LABEL,
  SETTLE_BASE_VALUE,
  INVOICE_REQUIREMENT_LABEL,
  INVOICE_REQUIREMENT_VALUE,
} from '@/lib/enum-mapping'

export const dynamic = 'force-dynamic'

// PUT - 更新供应商
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

    const body = await request.json()
    const { id } = params
    
    const settleBaseValue =
      (SETTLE_BASE_VALUE[body.settleBase] as SettleBase | undefined) ||
      (Object.values(SettleBase).includes(body.settleBase) ? (body.settleBase as SettleBase) : SettleBase.SHIPMENT)
    const invoiceReqValue =
      body.invoiceRequirement
        ? (INVOICE_REQUIREMENT_VALUE[body.invoiceRequirement] as InvoiceRequirement | undefined) ||
          (Object.values(InvoiceRequirement).includes(body.invoiceRequirement) ? (body.invoiceRequirement as InvoiceRequirement) : null)
        : null

    await clearCacheByPrefix("suppliers");
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: body.name,
        contact: body.contact,
        phone: body.phone,
        depositRate: body.depositRate,
        tailPeriodDays: body.tailPeriodDays,
        settleBase: settleBaseValue,
        level: body.level ? (body.level as "S" | "A" | "B" | "C") : null,
        category: body.category || null,
        address: body.address || null,
        bankAccount: body.bankAccount || null,
        bankName: body.bankName || null,
        taxId: body.taxId || null,
        invoiceRequirement: invoiceReqValue,
        invoicePoint: body.invoicePoint || null,
        defaultLeadTime: body.defaultLeadTime || null,
        moq: body.moq || null,
        factoryImages: body.factoryImages ? JSON.parse(JSON.stringify(body.factoryImages)) : null,
      }
    })
    
    // 转换格式，将 Decimal 字段转换为数字
    const transformed = {
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      phone: supplier.phone,
      depositRate: Number(supplier.depositRate), // 转换为数字
      tailPeriodDays: supplier.tailPeriodDays,
      settleBase: supplier.settleBase,
      level: supplier.level || undefined,
      category: supplier.category || undefined,
      address: supplier.address || undefined,
      bankAccount: supplier.bankAccount || undefined,
      bankName: supplier.bankName || undefined,
      taxId: supplier.taxId || undefined,
      invoiceRequirement: supplier.invoiceRequirement || undefined,
      invoicePoint: supplier.invoicePoint ? Number(supplier.invoicePoint) : undefined, // 转换为数字
      defaultLeadTime: supplier.defaultLeadTime || undefined,
      moq: supplier.moq || undefined,
      factoryImages: supplier.factoryImages ? JSON.parse(JSON.stringify(supplier.factoryImages)) : undefined,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString()
    }
    
    return NextResponse.json(transformed)
  } catch (error) {
    return handlePrismaError(error, { notFoundMessage: '未找到供应商', serverMessage: 'Failed to update supplier' })
  }
}

// DELETE - 删除供应商
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
    await clearCacheByPrefix("suppliers");
    await prisma.supplier.delete({
      where: { id }
    })

    return NextResponse.json({ message: 'Supplier deleted successfully' })
  } catch (error) {
    return handlePrismaError(error, { notFoundMessage: '未找到供应商', serverMessage: 'Failed to delete supplier' })
  }
}
