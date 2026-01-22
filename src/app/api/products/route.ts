import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
  createdAt: (p.createdAt ?? p.created_at ?? new Date()).toISOString?.() ?? p.createdAt ?? p.created_at,
  updatedAt: (p.updatedAt ?? p.updated_at ?? new Date()).toISOString?.() ?? p.updatedAt ?? p.updated_at,
})

// GET - 获取所有产品
export async function GET() {
  try {
    if (isMock()) {
      return NextResponse.json(mockStore.map(mapToApiProduct))
    }

    // 确保数据库连接
    try {
      await prisma.$connect()
    } catch (connectError: any) {
      console.error('数据库连接失败:', connectError)
      // 继续尝试查询，Prisma 可能会自动重连
    }

    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' }
    })
    
    console.log(`成功查询到 ${products.length} 个产品`)
    
    // 转换格式以匹配前端 Product 类型
    const transformed = products.map(p => ({
      sku_id: p.skuId,
      name: p.name,
      main_image: p.mainImage || '',
      category: p.category || undefined,
      status: p.status,
      cost_price: p.costPrice ? Number(p.costPrice) : 0,
      target_roi: p.targetRoi ? Number(p.targetRoi) : undefined,
      currency: p.currency as 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR',
      weight_kg: p.weightKg ? Number(p.weightKg) : undefined,
      length: p.lengthCm ? Number(p.lengthCm) : undefined,
      width: p.widthCm ? Number(p.widthCm) : undefined,
      height: p.heightCm ? Number(p.heightCm) : undefined,
      volumetric_divisor: p.volumetricDivisor || undefined,
      at_factory: p.atFactory || 0,
      at_domestic: p.atDomestic || 0,
      in_transit: p.inTransit || 0,
      suppliers: p.suppliers ? JSON.parse(JSON.stringify(p.suppliers)) : undefined,
      platform_sku_mapping: p.platformSkuMapping ? JSON.parse(JSON.stringify(p.platformSkuMapping)) : undefined,
      factory_id: p.suppliers && typeof p.suppliers === 'object' && Array.isArray(p.suppliers) 
        ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.id || (p.suppliers as any[])[0]?.id || undefined
        : undefined,
      factory_name: p.suppliers && typeof p.suppliers === 'object' && Array.isArray(p.suppliers)
        ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.name || (p.suppliers as any[])[0]?.name || undefined
        : undefined,
      moq: p.suppliers && typeof p.suppliers === 'object' && Array.isArray(p.suppliers)
        ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.moq || undefined
        : undefined,
      lead_time: p.suppliers && typeof p.suppliers === 'object' && Array.isArray(p.suppliers)
        ? (p.suppliers as any[]).find((s: any) => s.isPrimary)?.lead_time || undefined
        : undefined,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }))
    
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

// POST - 创建新产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
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
    const existing = await prisma.product.findUnique({
      where: { skuId: body.sku_id }
    })
    
    if (existing) {
      return NextResponse.json(
        { error: 'SKU already exists' },
        { status: 400 }
      )
    }
    
    const product = await prisma.product.create({
      data: {
        skuId: body.sku_id,
        name: body.name,
        mainImage: body.main_image || null,
        category: body.category || null,
        status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        currency: body.currency || 'CNY',
        costPrice: body.cost_price ? Number(body.cost_price) : null,
        targetRoi: body.target_roi ? Number(body.target_roi) : null,
        weightKg: body.weight_kg ? Number(body.weight_kg) : null,
        lengthCm: body.length ? Number(body.length) : null,
        widthCm: body.width ? Number(body.width) : null,
        heightCm: body.height ? Number(body.height) : null,
        volumetricDivisor: body.volumetric_divisor ? Number(body.volumetric_divisor) : null,
        atFactory: body.at_factory || 0,
        atDomestic: body.at_domestic || 0,
        inTransit: body.in_transit || 0,
        suppliers: body.suppliers ? JSON.parse(JSON.stringify(body.suppliers)) : null,
        platformSkuMapping: body.platform_sku_mapping ? JSON.parse(JSON.stringify(body.platform_sku_mapping)) : null,
      }
    })
    
    // 转换返回格式
    const transformed = mapToApiProduct(product)
    
    return NextResponse.json(transformed, { status: 201 })
  } catch (error) {
    console.error('Error creating product:', error)
    return NextResponse.json(
      { error: 'Failed to create product' },
      { status: 500 }
    )
  }
}
