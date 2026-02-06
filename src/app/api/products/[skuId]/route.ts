import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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

// PATCH - 仅更新变体字段（单价、库存等），不碰 SPU/图片/供应商，保存更快
export async function PATCH(
  request: NextRequest,
  { params }: { params: { skuId: string } }
) {
  try {
    const skuId = decodeURIComponent(params.skuId)
    const body = await request.json()

    const variantData: Record<string, unknown> = {}
    if (body.cost_price !== undefined) variantData.costPrice = body.cost_price ? parseFloat(String(body.cost_price)) : null
    if (body.stock_quantity !== undefined) variantData.stockQuantity = body.stock_quantity
    if (body.color !== undefined) variantData.color = body.color || null
    if (body.size !== undefined) variantData.size = body.size || null
    if (body.barcode !== undefined) variantData.barcode = body.barcode || null
    if (body.currency !== undefined) variantData.currency = body.currency
    if (body.target_roi !== undefined) variantData.targetRoi = body.target_roi ? parseFloat(String(body.target_roi)) : null
    if (body.weight_kg !== undefined) variantData.weightKg = body.weight_kg ? parseFloat(String(body.weight_kg)) : null
    if (body.length !== undefined) variantData.lengthCm = body.length ? parseFloat(String(body.length)) : null
    if (body.width !== undefined) variantData.widthCm = body.width ? parseFloat(String(body.width)) : null
    if (body.height !== undefined) variantData.heightCm = body.height ? parseFloat(String(body.height)) : null
    if (body.volumetric_divisor !== undefined) variantData.volumetricDivisor = body.volumetric_divisor ? parseInt(String(body.volumetric_divisor)) : null
    if (body.at_factory !== undefined) variantData.atFactory = body.at_factory
    if (body.at_domestic !== undefined) variantData.atDomestic = body.at_domestic
    if (body.in_transit !== undefined) variantData.inTransit = body.in_transit

    if (Object.keys(variantData).length === 0) {
      return NextResponse.json({ error: 'No variant fields to update' }, { status: 400 })
    }

    const v = await prisma.productVariant.update({
      where: { skuId },
      data: variantData as any
    })

    return NextResponse.json({
      sku_id: v.skuId,
      cost_price: v.costPrice != null ? Number(v.costPrice) : 0,
      stock_quantity: v.stockQuantity ?? 0,
      updatedAt: v.updatedAt.toISOString()
    })
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    console.error('PATCH product variant error:', error)
    return NextResponse.json(
      { error: error?.message || 'Update failed' },
      { status: 500 }
    )
  }
}

// PUT - 更新产品（全量，含 SPU/图片/供应商）
export async function PUT(
  request: NextRequest,
  { params }: { params: { skuId: string } }
) {
  try {
    const { skuId } = params
    const body = await request.json()
    
    if (isMock()) {
      const idx = mockStore.findIndex((p) => p.sku_id === skuId || p.skuId === skuId)
      if (idx === -1) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      if (body.sku_id && body.sku_id !== skuId) {
        const dup = mockStore.find((p) => (p.sku_id === body.sku_id || p.skuId === body.sku_id) && (p.sku_id !== skuId && p.skuId !== skuId))
        if (dup) {
          return NextResponse.json({ error: 'SKU already exists' }, { status: 400 })
        }
      }
      const existing = mockStore[idx]
      const updated = {
        ...existing,
        sku_id: body.sku_id && body.sku_id !== skuId ? body.sku_id : (existing.sku_id ?? existing.skuId),
        name: body.name,
        main_image: body.main_image || '',
        category: body.category || null,
        status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        currency: body.currency || existing.currency || 'CNY',
        cost_price: body.cost_price ? Number(body.cost_price) : existing.cost_price || 0,
        target_roi: body.target_roi ? Number(body.target_roi) : existing.target_roi,
        weight_kg: body.weight_kg ? Number(body.weight_kg) : existing.weight_kg,
        length: body.length ? Number(body.length) : existing.length,
        width: body.width ? Number(body.width) : existing.width,
        height: body.height ? Number(body.height) : existing.height,
        volumetric_divisor: body.volumetric_divisor ? Number(body.volumetric_divisor) : existing.volumetric_divisor,
        at_factory: body.at_factory ?? existing.at_factory ?? 0,
        at_domestic: body.at_domestic ?? existing.at_domestic ?? 0,
        in_transit: body.in_transit ?? existing.in_transit ?? 0,
        suppliers: body.suppliers ? JSON.parse(JSON.stringify(body.suppliers)) : existing.suppliers,
        platform_sku_mapping: body.platform_sku_mapping
          ? JSON.parse(JSON.stringify(body.platform_sku_mapping))
          : existing.platform_sku_mapping,
        updatedAt: new Date().toISOString(),
        createdAt: existing.createdAt ?? existing.created_at ?? new Date().toISOString(),
      }
      mockStore[idx] = updated
      return NextResponse.json(updated)
    }

    // 查找现有的 ProductVariant (SKU)
    const existingVariant = await prisma.productVariant.findUnique({
      where: { skuId: decodeURIComponent(skuId) },
      include: {
        product: {
          include: {
            productSuppliers: {
              include: {
                supplier: true
              }
            }
          }
        }
      }
    })
    
    if (!existingVariant) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // 如果 sku_id 改变，检查新 SKU 是否已存在
    if (body.sku_id && body.sku_id !== skuId) {
      const duplicate = await prisma.productVariant.findUnique({
        where: { skuId: body.sku_id }
      })
      
      if (duplicate) {
        return NextResponse.json(
          { error: 'SKU already exists' },
          { status: 400 }
        )
      }
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

    const productUpdateData: any = {
      name: body.name,
      spuCode: body.spu_code !== undefined ? (body.spu_code || null) : undefined,
      category: body.category || null,
      brand: body.brand !== undefined ? (body.brand || null) : undefined,
      description: body.description !== undefined ? (body.description || null) : undefined,
      mainImage: body.main_image !== undefined ? (body.main_image || null) : undefined,
      material: body.material !== undefined ? (body.material || null) : undefined,
      customsNameCN: body.customs_name_cn !== undefined ? (body.customs_name_cn || null) : undefined,
      customsNameEN: body.customs_name_en !== undefined ? (body.customs_name_en || null) : undefined,
      defaultSupplierId: body.default_supplier_id !== undefined ? (body.default_supplier_id || null) : undefined,
      status: body.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      suppliers: suppliersData ? JSON.parse(JSON.stringify(suppliersData)) : undefined
    }
    if (body.gallery_images !== undefined) {
      productUpdateData.galleryImages = Array.isArray(body.gallery_images) && body.gallery_images.length > 0
        ? JSON.parse(JSON.stringify(body.gallery_images))
        : null
    }
    const updatedProduct = await prisma.product.update({
      where: { id: existingVariant.productId },
      data: productUpdateData
    })

    // 更新 ProductVariant (SKU)
    const updatedVariant = await prisma.productVariant.update({
      where: { id: existingVariant.id },
      data: {
        ...(body.sku_id && body.sku_id !== skuId ? { skuId: body.sku_id } : {}),
        color: body.color !== undefined ? (body.color || null) : undefined,
        size: body.size !== undefined ? (body.size || null) : undefined,
        weightKg: body.weight_kg !== undefined ? (body.weight_kg ? parseFloat(String(body.weight_kg)) : null) : undefined,
        barcode: body.barcode !== undefined ? (body.barcode || null) : undefined,
        costPrice: body.cost_price !== undefined ? (body.cost_price ? parseFloat(String(body.cost_price)) : null) : undefined,
        stockQuantity: body.stock_quantity !== undefined 
          ? body.stock_quantity 
          : (body.at_factory !== undefined || body.at_domestic !== undefined || body.in_transit !== undefined)
            ? (body.at_factory || 0) + (body.at_domestic || 0) + (body.in_transit || 0)
            : undefined,
        currency: body.currency || undefined,
        targetRoi: body.target_roi !== undefined ? (body.target_roi ? parseFloat(String(body.target_roi)) : null) : undefined,
        lengthCm: body.length !== undefined ? (body.length ? parseFloat(String(body.length)) : null) : undefined,
        widthCm: body.width !== undefined ? (body.width ? parseFloat(String(body.width)) : null) : undefined,
        heightCm: body.height !== undefined ? (body.height ? parseFloat(String(body.height)) : null) : undefined,
        volumetricDivisor: body.volumetric_divisor !== undefined ? (body.volumetric_divisor ? parseInt(String(body.volumetric_divisor)) : null) : undefined,
        atFactory: body.at_factory !== undefined ? body.at_factory : undefined,
        atDomestic: body.at_domestic !== undefined ? body.at_domestic : undefined,
        inTransit: body.in_transit !== undefined ? body.in_transit : undefined,
        platformSkuMapping: body.platform_sku_mapping !== undefined
          ? (body.platform_sku_mapping ? JSON.parse(JSON.stringify(body.platform_sku_mapping)) : Prisma.JsonNull)
          : undefined
      }
    })

    // 仅当供应商有变化时才删除并重建关联，避免仅改价格时多轮 DB 写入
    const existingSuppliers = (existingVariant.product as any).productSuppliers ?? []
    const existingIds = existingSuppliers.map((ps: any) => ps.supplierId).sort().join(',')
    const newIds = (suppliersData ?? [])
      .filter((s: any) => s.id)
      .map((s: any) => s.id)
      .sort()
      .join(',')
    const suppliersUnchanged = existingIds === newIds && newIds !== ''
    if (suppliersData && Array.isArray(suppliersData) && !suppliersUnchanged) {
      await prisma.productSupplier.deleteMany({
        where: { productId: updatedProduct.id }
      })
      for (const supplier of suppliersData) {
        if (supplier.id) {
          try {
            await prisma.productSupplier.create({
              data: {
                productId: updatedProduct.id,
                supplierId: supplier.id,
                price: supplier.price ? parseFloat(String(supplier.price)) : null,
                moq: supplier.moq ? parseInt(String(supplier.moq)) : null,
                leadTime: supplier.lead_time ? parseInt(String(supplier.lead_time)) : null,
                isPrimary: supplier.isPrimary || false
              }
            })
          } catch (err: any) {
            console.error('更新 ProductSupplier 关联失败:', err)
          }
        }
      }
    }

    // 重新获取完整数据
    const productWithVariant = await prisma.product.findUnique({
      where: { id: updatedProduct.id },
      include: {
        variants: {
          where: { id: updatedVariant.id }
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
    const v = updatedVariant
    
    const galleryImages = (updatedProduct as any).galleryImages
    const gallery_images = galleryImages == null ? [] : Array.isArray(galleryImages) ? [...galleryImages] : (typeof galleryImages === 'string' ? (() => { try { const a = JSON.parse(galleryImages); return Array.isArray(a) ? a : []; } catch { return []; } })() : [])
    return NextResponse.json({
      sku_id: v.skuId,
      spu_code: (updatedProduct as any).spuCode ?? undefined,
      name: updatedProduct.name,
      main_image: updatedProduct.mainImage || '',
      gallery_images,
      category: updatedProduct.category || undefined,
      brand: updatedProduct.brand || undefined,
      description: updatedProduct.description || undefined,
      material: updatedProduct.material || undefined,
      customs_name_cn: updatedProduct.customsNameCN || undefined,
      customs_name_en: updatedProduct.customsNameEN || undefined,
      default_supplier_id: updatedProduct.defaultSupplierId || undefined,
      default_supplier_name: productWithVariant?.defaultSupplier?.name || undefined,
      status: updatedProduct.status,
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
      product_id: updatedProduct.id,
      variant_id: v.id,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString()
    })
  } catch (error) {
    console.error(`Error updating product ${params.skuId}:`, error)
    return NextResponse.json(
      { error: `Failed to update product ${params.skuId}` },
      { status: 500 }
    )
  }
}

// DELETE - 删除产品
export async function DELETE(
  request: NextRequest,
  { params }: { params: { skuId: string } }
) {
  try {
    const { skuId } = params
    if (isMock()) {
      const idx = mockStore.findIndex((p) => p.sku_id === skuId || p.skuId === skuId)
      if (idx === -1) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      mockStore.splice(idx, 1)
      return NextResponse.json({ message: 'Product deleted successfully' })
    }
    
    // 查找 ProductVariant (SKU)
    const variant = await prisma.productVariant.findUnique({
      where: { skuId: decodeURIComponent(skuId) },
      include: {
        product: {
          include: {
            variants: true
          }
        }
      }
    })
    
    if (!variant) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    // 删除 ProductVariant (SKU)
    await prisma.productVariant.delete({
      where: { id: variant.id }
    })

    // 如果这是该 Product (SPU) 的最后一个 variant，也删除 Product
    if (variant.product.variants.length === 1) {
      await prisma.product.delete({
        where: { id: variant.productId }
      })
    }
    
    return NextResponse.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error(`Error deleting product ${params.skuId}:`, error)
    return NextResponse.json(
      { error: `Failed to delete product ${params.skuId}` },
      { status: 500 }
    )
  }
}
