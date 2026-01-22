import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SettleBase, InvoiceRequirement } from '@prisma/client'
import {
  SETTLE_BASE_LABEL,
  SETTLE_BASE_VALUE,
  INVOICE_REQUIREMENT_LABEL,
  INVOICE_REQUIREMENT_VALUE,
} from '@/lib/enum-mapping'

// GET - 获取所有供应商
export async function GET() {
  try {
    // 确保数据库连接
    await prisma.$connect().catch(() => {
      // 连接失败时继续尝试查询，Prisma 会自动重连
    })

    const suppliers = await prisma.supplier.findMany({
      orderBy: { name: 'asc' }
    })

    // 转换格式，将 Decimal 字段转换为数字
    const transformed = suppliers.map(s => ({
      id: s.id,
      name: s.name,
      contact: s.contact,
      phone: s.phone,
      depositRate: Number(s.depositRate), // 转换为数字
      tailPeriodDays: s.tailPeriodDays,
      settleBase: s.settleBase,
      level: s.level || undefined,
      category: s.category || undefined,
      address: s.address || undefined,
      bankAccount: s.bankAccount || undefined,
      bankName: s.bankName || undefined,
      taxId: s.taxId || undefined,
      invoiceRequirement: s.invoiceRequirement || undefined,
      invoicePoint: s.invoicePoint ? Number(s.invoicePoint) : undefined, // 转换为数字
      defaultLeadTime: s.defaultLeadTime || undefined,
      moq: s.moq || undefined,
      factoryImages: s.factoryImages ? JSON.parse(JSON.stringify(s.factoryImages)) : undefined,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error: any) {
    console.error('Error fetching suppliers:', error)
    
    // 检查是否是数据库连接错误
    if (error.message?.includes('TLS connection') || 
        error.message?.includes('connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001' ||
        !process.env.DATABASE_URL) {
      return NextResponse.json(
        { 
          error: '数据库连接失败',
          details: process.env.NODE_ENV === 'production' 
            ? '请检查 Vercel 环境变量中的 DATABASE_URL 配置'
            : '请检查 .env.local 中的 DATABASE_URL 配置'
        },
        { status: 503 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch suppliers', details: error.message },
      { status: 500 }
    )
  }
}

// POST - 创建新供应商
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const settleBaseValue =
      (SETTLE_BASE_VALUE[body.settleBase] as SettleBase | undefined) ||
      (Object.values(SettleBase).includes(body.settleBase) ? (body.settleBase as SettleBase) : SettleBase.SHIPMENT)
    const invoiceReqValue =
      body.invoiceRequirement
        ? (INVOICE_REQUIREMENT_VALUE[body.invoiceRequirement] as InvoiceRequirement | undefined) ||
          (Object.values(InvoiceRequirement).includes(body.invoiceRequirement) ? (body.invoiceRequirement as InvoiceRequirement) : null)
        : null

    const supplier = await prisma.supplier.create({
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
    
    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error('Error creating supplier:', error)
    return NextResponse.json(
      { error: 'Failed to create supplier' },
      { status: 500 }
    )
  }
}
