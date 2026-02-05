import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Product as PrismaProduct } from '@prisma/client'

export const dynamic = 'force-dynamic'

const mockStore: any[] = (global as any).__mockProducts || []
;(global as any).__mockProducts = mockStore

const isMock = () => false // 禁用mock模式，直接连接数据库

const mapToApiProduct = (p: any) => ({
  sku_id: p.skuId ?? p.sku_id,
  name: p.name,
  main_image: p.mainImage ?? p.main_image ?? '',
  category: p.category || undefined,
  status: p.status,
  cost_price: p.costPrice ? Number(p.costPrice) : p.cost_price ? Number(p.cost_price) : 0,
  target_roi: p.targetRoi ? Number(p.targetRoi) : p.target_roi ? Number(p.target_roi) : undefined,
  currency: p.currency as 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR',
  weight_kg: p.weightKg ? Number(p.weightKg) : p.weight_kg ? Number(p.weight_kg) : undefined,
  length: p.lengthCm ? Number(p.lengthCm) : p.length ? Number(p.length) : undefined,
  width: p.widthCm ? Number(p.widthCm) : p.width ? Number(p.width) : undefined,
  height: p.heightCm ? Number(p.heightCm) : p.height ? Number(p.height) : undefined,
  volumetric_divisor: p.volumetricDivisor ?? p.volumetric_divisor ?? undefined,
  at_factory: p.atFactory ?? p.at_factory ?? 0,
  at_domestic: p.atDomestic ?? p.at_domestic ?? 0,
  in_transit: p.inTransit ?? p.in_transit ?? 0,
  suppliers: p.suppliers ? JSON.parse(JSON.stringify(p.suppliers)) : undefined,
  platform_sku_mapping: p.platformSkuMapping ? JSON.parse(JSON.stringify(p.platformSkuMapping)) : undefined,
  factory_id: p.suppliers && Array.isArray(p.suppliers)
    ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.id || (p.suppliers as any[])[0]?.id || undefined
    : undefined,
  factory_name: p.suppliers && Array.isArray(p.suppliers)
    ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.name || (p.suppliers as any[])[0]?.name || undefined
    : undefined,
  moq: p.suppliers && Array.isArray(p.suppliers)
    ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.moq || undefined
    : undefined,
  lead_time: p.suppliers && Array.isArray(p.suppliers)
    ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.lead_time || undefined
    : undefined,
  createdAt: toIsoString(p.createdAt ?? p.created_at),
  updatedAt: toIsoString(p.updatedAt ?? p.updated_at),
})

function toIsoString(v: unknown): string {
  if (v == null) return new Date().toISOString()
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  return new Date().toISOString()
}

// 将单个 Product (含 variants) 转为前端用的扁平 SKU 列表（与 GET 全量格式一致）
function productToFlatVariants(product: any): any[] {
  const transformed: any[] = []
  const variants = product.variants ?? []
  if (variants.length === 0) {
    transformed.push({
      sku_id: `temp-${product.id}`,
      name: product.name,
      main_image: product.mainImage || '',
      category: product.category || undefined,
      brand: product.brand || undefined,
      description: product.description || undefined,
      material: product.material || undefined,
      spec_description: (product as any).specDescription ?? undefined,
      customs_name_cn: product.customsNameCN || undefined,
      customs_name_en: product.customsNameEN || undefined,
      default_supplier_id: product.defaultSupplierId || undefined,
      default_supplier_name: product.defaultSupplier?.name || undefined,
      status: product.status,
      cost_price: 0,
      target_roi: undefined,
      currency: 'CNY' as const,
      weight_kg: undefined,
      length: undefined,
      width: undefined,
      height: undefined,
      volumetric_divisor: undefined,
      color: undefined,
      size: undefined,
      barcode: undefined,
      stock_quantity: 0,
      at_factory: 0,
      at_domestic: 0,
      in_transit: 0,
      suppliers: product.suppliers ? JSON.parse(JSON.stringify(product.suppliers)) : undefined,
      platform_sku_mapping: undefined,
      factory_id: undefined,
      factory_name: undefined,
      moq: undefined,
      lead_time: undefined,
      product_id: product.id,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString()
    })
  } else {
    const suppliers = (product.productSuppliers ?? []).map((ps: any) => ({
      id: ps.supplier?.id,
      name: ps.supplier?.name ?? '',
      price: ps.price != null ? Number(ps.price) : undefined,
      moq: ps.moq ?? undefined,
      lead_time: ps.leadTime ?? undefined,
      isPrimary: ps.isPrimary ?? false
    }))
    const primarySupplier = suppliers.find((s: any) => s.isPrimary) || suppliers[0]
    for (const variant of variants) {
      transformed.push({
        sku_id: variant.skuId,
        name: product.name,
        main_image: product.mainImage || '',
        category: product.category || undefined,
        brand: product.brand || undefined,
        description: product.description || undefined,
        material: product.material || undefined,
        spec_description: (product as any).specDescription ?? undefined,
        customs_name_cn: product.customsNameCN || undefined,
        customs_name_en: product.customsNameEN || undefined,
        default_supplier_id: product.defaultSupplierId || undefined,
        default_supplier_name: product.defaultSupplier?.name || undefined,
        status: product.status,
        cost_price: variant.costPrice != null ? Number(variant.costPrice) : 0,
        target_roi: variant.targetRoi != null ? Number(variant.targetRoi) : undefined,
        currency: (variant.currency ?? 'CNY') as 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR',
        weight_kg: variant.weightKg != null ? Number(variant.weightKg) : undefined,
        length: variant.lengthCm != null ? Number(variant.lengthCm) : undefined,
        width: variant.widthCm != null ? Number(variant.widthCm) : undefined,
        height: variant.heightCm != null ? Number(variant.heightCm) : undefined,
        volumetric_divisor: variant.volumetricDivisor ?? undefined,
        color: variant.color ?? undefined,
        size: variant.size ?? undefined,
        barcode: variant.barcode ?? undefined,
        stock_quantity: variant.stockQuantity ?? 0,
        at_factory: variant.atFactory ?? 0,
        at_domestic: variant.atDomestic ?? 0,
        in_transit: variant.inTransit ?? 0,
        suppliers: suppliers.length > 0 ? suppliers : (product.suppliers ? JSON.parse(JSON.stringify(product.suppliers)) : undefined),
        platform_sku_mapping: variant.platformSkuMapping ? JSON.parse(JSON.stringify(variant.platformSkuMapping)) : undefined,
        factory_id: primarySupplier?.id || undefined,
        factory_name: primarySupplier?.name || undefined,
        moq: primarySupplier?.moq || undefined,
        lead_time: primarySupplier?.lead_time || undefined,
        product_id: product.id,
        variant_id: variant.id,
        createdAt: variant.createdAt.toISOString(),
        updatedAt: variant.updatedAt.toISOString()
      })
    }
  }
  return transformed
}

// GET - 获取产品（支持三种模式：list=spu 仅 SPU 列表 | spuId=xxx 单 SPU 全量变体 | 无参全量，兼容旧逻辑）
export async function GET(request: NextRequest) {
  try {
    if (isMock()) {
      return NextResponse.json(mockStore.map(mapToApiProduct))
    }

    const { searchParams } = new URL(request.url)
    const listSpu = searchParams.get('list') === 'spu'
    const spuId = searchParams.get('spuId')

    // 模式 1：仅拉取 SPU 列表（主图、状态、变体数，用于产品卡片聚合展示）
    if (listSpu) {
      const products = await prisma.product.findMany({
        select: { id: true, name: true, mainImage: true, status: true, category: true, _count: { select: { variants: true } } },
        orderBy: { createdAt: 'desc' }
      })
      const list = products.map((p) => ({
        productId: p.id,
        name: p.name,
        mainImage: p.mainImage ?? '',
        status: p.status,
        category: p.category ?? undefined,
        variantCount: p._count.variants
      }))
      return NextResponse.json(list)
    }

    // 模式 2：按需拉取单个 SPU 及其全部 SKU（include 一次性拿到，前端缓存）
    if (spuId) {
      const product = await prisma.product.findUnique({
        where: { id: spuId },
        include: {
          variants: {
            orderBy: [
              { color: 'asc' },
              { size: 'asc' },
              { skuId: 'asc' }
            ]
          },
          productSuppliers: { include: { supplier: true } },
          defaultSupplier: { select: { id: true, name: true } }
        }
      })
      if (!product) {
        return NextResponse.json({ error: '产品不存在' }, { status: 404 })
      }
      const transformed = productToFlatVariants(product)
      return NextResponse.json(transformed)
    }

    // 模式 3：无参，全量（兼容原有 getProductsFromAPI 等调用）
    const products = await prisma.product.findMany({
      include: {
        variants: {
          orderBy: [
            { color: 'asc' },
            { size: 'asc' },
            { skuId: 'asc' }
          ]
        },
        productSuppliers: {
          include: {
            supplier: true
          }
        },
        defaultSupplier: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const transformed: any[] = []
    for (const product of products) {
      transformed.push(...productToFlatVariants(product))
    }

    return NextResponse.json(transformed)
  } catch (error: any) {
    console.error('Error fetching products:', error)
    console.error('DATABASE_URL exists:', !!process.env.DATABASE_URL)
    console.error('NODE_ENV:', process.env.NODE_ENV)
    
    // 检查是否是数据库连接错误
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { 
          error: '数据库连接失败',
          details: 'DATABASE_URL 环境变量未配置。请在 Vercel 项目设置中添加 DATABASE_URL 环境变量，然后重新部署。',
          env: process.env.NODE_ENV
        },
        { status: 503 }
      )
    }
    
    if (error.message?.includes('TLS connection') || 
        error.message?.includes('connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001') {
      return NextResponse.json(
        { 
          error: '数据库连接失败',
          details: process.env.NODE_ENV === 'production' 
            ? '请检查 Vercel 环境变量中的 DATABASE_URL 配置是否正确，然后重新部署'
            : '请检查 .env.local 中的 DATABASE_URL 配置',
          env: process.env.NODE_ENV
        },
        { status: 503 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch products', details: error.message },
      { status: 500 }
    )
  }
}

async function createProductWithVariants(body: any, variantsInput: any[]) {
  if (!body.name?.trim()) {
    return NextResponse.json({ error: '产品名称必填' }, { status: 400 })
  }
  const skuIds = variantsInput.map((v: any) => (v.sku_id || '').trim()).filter(Boolean)
  if (skuIds.length === 0) {
    return NextResponse.json({ error: '至少需要一个有效的 SKU 编码' }, { status: 400 })
  }
  const uniqueSkuIds = [...new Set(skuIds)]
  if (uniqueSkuIds.length !== skuIds.length) {
    return NextResponse.json({ error: '变体 SKU 编码不能重复' }, { status: 400 })
  }

  const existing = await prisma.productVariant.findMany({
    where: { skuId: { in: uniqueSkuIds } }
  })
  if (existing.length > 0) {
    return NextResponse.json(
      { error: `SKU 已存在：${existing.map(e => e.skuId).join(', ')}` },
      { status: 400 }
    )
  }

  let suppliersData = null
  if (body.suppliers && Array.isArray(body.suppliers) && body.suppliers.length > 0) {
    suppliersData = body.suppliers
  } else if (body.factory_id) {
    suppliersData = [{
      id: body.factory_id,
      name: body.factory_name || '',
      price: variantsInput[0]?.cost_price ?? body.cost_price,
      moq: body.moq,
      lead_time: body.lead_time,
      isPrimary: true
    }]
  }

  // 优先用 product_id 查找已有产品（添加变体时前端会传），否则用 name
  const intentAddToExisting = !!body.product_id
  let product: PrismaProduct | null = null
  if (body.product_id) {
    product = await prisma.product.findUnique({
      where: { id: String(body.product_id) }
    })
  }
  if (!product && body.name?.trim()) {
    product = await prisma.product.findFirst({
      where: { name: body.name.trim() }
    })
  }
  // 添加变体时若传了 product_id 却未找到产品，不创建新产品，直接报错
  if (!product && intentAddToExisting) {
    return NextResponse.json(
      { error: '未找到对应的产品，请刷新产品列表后重试', code: 'PRODUCT_NOT_FOUND' },
      { status: 400 }
    )
  }
  if (!product) {
    const createData: any = {
        name: body.name.trim(),
        category: body.category || null,
        brand: body.brand || null,
        description: body.description || null,
        mainImage: body.main_image || null,
        material: body.material || null,
        customsNameCN: body.customs_name_cn || null,
        customsNameEN: body.customs_name_en || null,
        defaultSupplierId: body.default_supplier_id || null,
        status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        suppliers: suppliersData ? JSON.parse(JSON.stringify(suppliersData)) : null
      }
    if ((body as any).spec_description) createData.specDescription = (body as any).spec_description
    product = await prisma.product.create({ data: createData })
  }

  const currency = body.currency || 'CNY'
  const createdVariants: any[] = []
  for (let i = 0; i < variantsInput.length; i++) {
    const v = variantsInput[i]
    const skuId = (v.sku_id || '').trim()
    if (!skuId) continue
    const costPrice = Number(v.cost_price ?? v.unitPrice ?? 0)
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        skuId,
        color: v.color || null,
        size: v.size || null,
        weightKg: body.weight_kg ? parseFloat(String(body.weight_kg)) : null,
        barcode: v.barcode || null,
        costPrice: Number.isFinite(costPrice) ? costPrice : null,
        stockQuantity: 0,
        currency,
        targetRoi: body.target_roi ? parseFloat(String(body.target_roi)) : null,
        lengthCm: body.length ? parseFloat(String(body.length)) : null,
        widthCm: body.width ? parseFloat(String(body.width)) : null,
        heightCm: body.height ? parseFloat(String(body.height)) : null,
        volumetricDivisor: body.volumetric_divisor ? parseInt(String(body.volumetric_divisor)) : null,
        atFactory: 0,
        atDomestic: 0,
        inTransit: 0,
      }
    })
    createdVariants.push(variant)
  }

  if (suppliersData && Array.isArray(suppliersData)) {
    for (const supplier of suppliersData) {
      if (supplier.id) {
        try {
          await prisma.productSupplier.upsert({
            where: {
              productId_supplierId: {
                productId: product.id,
                supplierId: supplier.id
              }
            },
            create: {
              productId: product.id,
              supplierId: supplier.id,
              price: suppliersData[0]?.price ? parseFloat(String(suppliersData[0].price)) : null,
              moq: suppliersData[0]?.moq || null,
              leadTime: suppliersData[0]?.lead_time || null,
              isPrimary: suppliersData[0]?.isPrimary || false
            },
            update: {}
          })
        } catch (err) {
          // ignore
        }
      }
    }
  }

  const v = createdVariants[0]
  return NextResponse.json({
    sku_id: v.skuId,
    name: product.name,
    main_image: product.mainImage || '',
    category: product.category || undefined,
    brand: product.brand || undefined,
    description: product.description || undefined,
    material: product.material || undefined,
    customs_name_cn: product.customsNameCN || undefined,
    customs_name_en: product.customsNameEN || undefined,
    default_supplier_id: product.defaultSupplierId || undefined,
    status: product.status,
    cost_price: v.costPrice ? Number(v.costPrice) : 0,
    currency: v.currency,
    color: v.color || undefined,
    size: v.size || undefined,
    barcode: v.barcode || undefined,
    product_id: product.id,
    variant_id: v.id,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString()
  }, { status: 201 })
}

// POST - 创建新产品（支持单变体或 body.variants 批量创建多变体）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // 批量创建多变体：body.variants = [{ color, sku_id, cost_price, size?, barcode? }, ...]
    const variantsInput = Array.isArray(body.variants) && body.variants.length > 0 ? body.variants : null
    if (variantsInput) {
      return await createProductWithVariants(body, variantsInput)
    }
    
    if (isMock()) {
      const exists = mockStore.find((p) => p.sku_id === body.sku_id || p.skuId === body.sku_id)
      if (exists) {
        return NextResponse.json({ error: 'SKU already exists' }, { status: 400 })
      }
      const now = new Date().toISOString()
      const saved = {
        sku_id: body.sku_id,
        name: body.name,
        main_image: body.main_image || '',
        category: body.category || null,
        status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        currency: body.currency || 'CNY',
        cost_price: body.cost_price ? Number(body.cost_price) : 0,
        target_roi: body.target_roi ? Number(body.target_roi) : undefined,
        weight_kg: body.weight_kg ? Number(body.weight_kg) : undefined,
        length: body.length ? Number(body.length) : undefined,
        width: body.width ? Number(body.width) : undefined,
        height: body.height ? Number(body.height) : undefined,
        volumetric_divisor: body.volumetric_divisor ? Number(body.volumetric_divisor) : undefined,
        at_factory: body.at_factory || 0,
        at_domestic: body.at_domestic || 0,
        in_transit: body.in_transit || 0,
        suppliers: body.suppliers ? JSON.parse(JSON.stringify(body.suppliers)) : undefined,
        platform_sku_mapping: body.platform_sku_mapping ? JSON.parse(JSON.stringify(body.platform_sku_mapping)) : undefined,
        createdAt: now,
        updatedAt: now,
      }
      mockStore.push(saved)
      return NextResponse.json(saved, { status: 201 })
    }
    
    // 检查 SKU 是否已存在
    const existingVariant = await prisma.productVariant.findUnique({
      where: { skuId: body.sku_id }
    })
    
    if (existingVariant) {
      return NextResponse.json(
        { error: 'SKU already exists' },
        { status: 400 }
      )
    }

    // 处理供应商信息
    let suppliersData = null
    if (body.suppliers && Array.isArray(body.suppliers) && body.suppliers.length > 0) {
      suppliersData = body.suppliers
    } else if (body.factory_id) {
      // 兼容旧的单供应商模式
      suppliersData = [{
        id: body.factory_id,
        name: body.factory_name || '',
        price: body.cost_price,
        moq: body.moq,
        lead_time: body.lead_time,
        isPrimary: true
      }]
    }

    // 检查是否已存在同名的 Product (SPU)
    // 如果存在，使用现有的 Product；否则创建新的
    let product = await prisma.product.findFirst({
      where: { name: body.name }
    })

    if (!product) {
      // 创建新的 Product (SPU)
      product = await prisma.product.create({
        data: {
          name: body.name,
          category: body.category || null,
          brand: body.brand || null,
          description: body.description || null,
          mainImage: body.main_image || null,
          material: body.material || null,
          customsNameCN: body.customs_name_cn || null,
          customsNameEN: body.customs_name_en || null,
          defaultSupplierId: body.default_supplier_id || null,
          status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
          suppliers: suppliersData ? JSON.parse(JSON.stringify(suppliersData)) : null
        }
      })
    }

    // 创建 ProductVariant (SKU)
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        skuId: body.sku_id,
        color: body.color || null,
        size: body.size || null,
        weightKg: body.weight_kg ? parseFloat(String(body.weight_kg)) : null,
        barcode: body.barcode || null,
        costPrice: body.cost_price ? parseFloat(String(body.cost_price)) : null,
        stockQuantity: (body.at_factory || 0) + (body.at_domestic || 0) + (body.in_transit || 0),
        currency: body.currency || 'CNY',
        targetRoi: body.target_roi ? parseFloat(String(body.target_roi)) : null,
        lengthCm: body.length ? parseFloat(String(body.length)) : null,
        widthCm: body.width ? parseFloat(String(body.width)) : null,
        heightCm: body.height ? parseFloat(String(body.height)) : null,
        volumetricDivisor: body.volumetric_divisor ? parseInt(String(body.volumetric_divisor)) : null,
        atFactory: body.at_factory || 0,
        atDomestic: body.at_domestic || 0,
        inTransit: body.in_transit || 0,
        ...(body.platform_sku_mapping ? { platformSkuMapping: JSON.parse(JSON.stringify(body.platform_sku_mapping)) } : {}),
      }
    })

    // 如果提供了供应商信息，创建 ProductSupplier 关联
    if (suppliersData && Array.isArray(suppliersData)) {
      for (const supplier of suppliersData) {
        if (supplier.id) {
          try {
            await prisma.productSupplier.upsert({
              where: {
                productId_supplierId: {
                  productId: product.id,
                  supplierId: supplier.id
                }
              },
              create: {
                productId: product.id,
                supplierId: supplier.id,
                price: supplier.price ? parseFloat(String(supplier.price)) : null,
                moq: supplier.moq ? parseInt(String(supplier.moq)) : null,
                leadTime: supplier.lead_time ? parseInt(String(supplier.lead_time)) : null,
                isPrimary: supplier.isPrimary || false
              },
              update: {
                price: supplier.price ? parseFloat(String(supplier.price)) : null,
                moq: supplier.moq ? parseInt(String(supplier.moq)) : null,
                leadTime: supplier.lead_time ? parseInt(String(supplier.lead_time)) : null,
                isPrimary: supplier.isPrimary || false
              }
            })
          } catch (err: any) {
            console.error('创建 ProductSupplier 关联失败:', err)
            // 不阻止产品创建，只记录错误
          }
        }
      }
    }

    // 返回格式化的产品数据（包含 variant 信息）
    const productWithVariant = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        variants: {
          where: { id: variant.id }
        },
        productSuppliers: {
          include: {
            supplier: true
          }
        },
        defaultSupplier: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    // 转换为前端格式
    const primarySupplier = (productWithVariant?.productSuppliers ?? []).find(ps => ps.isPrimary) ?? (productWithVariant?.productSuppliers ?? [])[0]
    const v = variant
    
    return NextResponse.json({
      sku_id: v.skuId,
      name: product.name,
      main_image: product.mainImage || '',
      category: product.category || undefined,
      brand: product.brand || undefined,
      description: product.description || undefined,
      material: product.material || undefined,
      customs_name_cn: product.customsNameCN || undefined,
      customs_name_en: product.customsNameEN || undefined,
      default_supplier_id: product.defaultSupplierId || undefined,
      default_supplier_name: productWithVariant?.defaultSupplier?.name || undefined,
      status: product.status,
      cost_price: v.costPrice != null ? Number(v.costPrice) : 0,
      target_roi: v.targetRoi != null ? Number(v.targetRoi) : undefined,
      currency: (v.currency ?? 'CNY') as 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR',
      weight_kg: v.weightKg != null ? Number(v.weightKg) : undefined,
      length: v.lengthCm != null ? Number(v.lengthCm) : undefined,
      width: v.widthCm != null ? Number(v.widthCm) : undefined,
      height: v.heightCm != null ? Number(v.heightCm) : undefined,
      volumetric_divisor: v.volumetricDivisor ?? undefined,
      color: v.color ?? undefined,
      size: v.size ?? undefined,
      barcode: v.barcode ?? undefined,
      stock_quantity: v.stockQuantity ?? 0,
      at_factory: v.atFactory ?? 0,
      at_domestic: v.atDomestic ?? 0,
      in_transit: v.inTransit ?? 0,
      suppliers: (productWithVariant?.productSuppliers ?? []).map(ps => ({
        id: ps.supplier.id,
        name: ps.supplier.name,
        price: ps.price != null ? Number(ps.price) : undefined,
        moq: ps.moq ?? undefined,
        lead_time: ps.leadTime ?? undefined,
        isPrimary: ps.isPrimary
      })),
      platform_sku_mapping: v.platformSkuMapping ? JSON.parse(JSON.stringify(v.platformSkuMapping)) : undefined,
      factory_id: primarySupplier?.supplier?.id ?? undefined,
      factory_name: primarySupplier?.supplier?.name ?? undefined,
      moq: primarySupplier?.moq ?? undefined,
      lead_time: primarySupplier?.leadTime ?? undefined,
      product_id: product.id,
      variant_id: v.id,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}
