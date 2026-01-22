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

// PUT - 更新产品
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

    // 如果 sku_id 改变，检查新 SKU 是否已存在
    if (body.sku_id && body.sku_id !== skuId) {
      const existing = await prisma.product.findUnique({
        where: { skuId: body.sku_id }
      })
      
      if (existing) {
        return NextResponse.json(
          { error: 'SKU already exists' },
          { status: 400 }
        )
      }
    }
    
    const updated = await prisma.product.update({
      where: { skuId: decodeURIComponent(skuId) },
      data: {
        ...(body.sku_id && body.sku_id !== skuId ? { skuId: body.sku_id } : {}),
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
        atFactory: body.at_factory !== undefined ? body.at_factory : undefined,
        atDomestic: body.at_domestic !== undefined ? body.at_domestic : undefined,
        inTransit: body.in_transit !== undefined ? body.in_transit : undefined,
        suppliers: body.suppliers ? JSON.parse(JSON.stringify(body.suppliers)) : null,
        platformSkuMapping: body.platform_sku_mapping ? JSON.parse(JSON.stringify(body.platform_sku_mapping)) : null,
        updatedAt: new Date()
      }
    })
    
    // 转换返回格式
    const transformed = {
      sku_id: updated.skuId,
      name: updated.name,
      main_image: updated.mainImage || '',
      category: updated.category || undefined,
      status: updated.status,
      cost_price: updated.costPrice ? Number(updated.costPrice) : 0,
      target_roi: updated.targetRoi ? Number(updated.targetRoi) : undefined,
      currency: updated.currency as 'CNY' | 'USD' | 'HKD' | 'JPY' | 'GBP' | 'EUR',
      weight_kg: updated.weightKg ? Number(updated.weightKg) : undefined,
      length: updated.lengthCm ? Number(updated.lengthCm) : undefined,
      width: updated.widthCm ? Number(updated.widthCm) : undefined,
      height: updated.heightCm ? Number(updated.heightCm) : undefined,
      volumetric_divisor: updated.volumetricDivisor || undefined,
      at_factory: updated.atFactory || 0,
      at_domestic: updated.atDomestic || 0,
      in_transit: updated.inTransit || 0,
      suppliers: updated.suppliers ? JSON.parse(JSON.stringify(updated.suppliers)) : undefined,
      platform_sku_mapping: updated.platformSkuMapping ? JSON.parse(JSON.stringify(updated.platformSkuMapping)) : undefined,
      factory_id: updated.suppliers && typeof updated.suppliers === 'object' && Array.isArray(updated.suppliers)
        ? (updated.suppliers as any[]).find((s: any) => s.isPrimary)?.id || (updated.suppliers as any[])[0]?.id || undefined
        : undefined,
      factory_name: updated.suppliers && typeof updated.suppliers === 'object' && Array.isArray(updated.suppliers)
        ? (updated.suppliers as any[]).find((s: any) => s.isPrimary)?.name || (updated.suppliers as any[])[0]?.name || undefined
        : undefined,
      moq: updated.suppliers && typeof updated.suppliers === 'object' && Array.isArray(updated.suppliers)
        ? (updated.suppliers as any[]).find((s: any) => s.isPrimary)?.moq || undefined
        : undefined,
      lead_time: updated.suppliers && typeof updated.suppliers === 'object' && Array.isArray(updated.suppliers)
        ? (updated.suppliers as any[]).find((s: any) => s.isPrimary)?.lead_time || undefined
        : undefined,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }
    
    return NextResponse.json(transformed)
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
    
    await prisma.product.delete({
      where: { skuId: decodeURIComponent(skuId) }
    })
    
    return NextResponse.json({ message: 'Product deleted successfully' })
  } catch (error) {
    console.error(`Error deleting product ${params.skuId}:`, error)
    return NextResponse.json(
      { error: `Failed to delete product ${params.skuId}` },
      { status: 500 }
    )
  }
}
