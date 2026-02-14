import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { InventoryLocation, InventoryMovementType } from '@prisma/client'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 120; // 2分钟（库存变动频繁）
const CACHE_KEY_PREFIX = 'inventory-movements';

// GET - 获取所有库存变动
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId') || searchParams.get('productId')
    const location = searchParams.get('location')
    const movementType = searchParams.get('movementType')
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      variantId || 'all',
      location || 'all',
      movementType || 'all',
      String(page),
      String(pageSize)
    )

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1 && !variantId) {
      const cached = await getCache<any>(cacheKey)
      if (cached) {
        console.log(`✅ Inventory movements cache HIT: ${cacheKey}`)
        return NextResponse.json(cached)
      }
    }

    const where: any = {}
    if (variantId) where.variantId = variantId
    if (location) where.location = location as InventoryLocation
    if (movementType) where.movementType = movementType as InventoryMovementType

    const [movements, total] = await prisma.$transaction([
      prisma.inventoryMovement.findMany({
        where,
        select: {
          id: true, variantId: true, location: true, movementType: true,
          qty: true, qtyBefore: true, qtyAfter: true,
          unitCost: true, totalCost: true, currency: true,
          relatedOrderId: true, relatedOrderType: true, relatedOrderNumber: true,
          operator: true, operationDate: true, notes: true, createdAt: true,
          variant: { select: { id: true, productId: true, skuId: true, product: { select: { id: true, name: true } } } },
        },
        orderBy: { operationDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inventoryMovement.count({ where }),
    ])

    const response = {
      data: movements.map(m => ({
        id: m.id,
        variantId: m.variantId,
        productId: m.variant?.productId,
        skuId: m.variant?.skuId,
        location: m.location,
        movementType: m.movementType,
        qty: m.qty,
        qtyBefore: m.qtyBefore,
        qtyAfter: m.qtyAfter,
        unitCost: m.unitCost ? Number(m.unitCost) : undefined,
        totalCost: m.totalCost ? Number(m.totalCost) : undefined,
        currency: m.currency || undefined,
        relatedOrderId: m.relatedOrderId || undefined,
        relatedOrderType: m.relatedOrderType || undefined,
        relatedOrderNumber: m.relatedOrderNumber || undefined,
        operator: m.operator || undefined,
        operationDate: m.operationDate.toISOString(),
        notes: m.notes || undefined,
        createdAt: m.createdAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    }

    // 设置缓存（仅第一页且无筛选时）
    if (!noCache && page === 1 && !variantId) {
      await setCache(cacheKey, response, CACHE_TTL)
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching inventory movements:', error)
    return NextResponse.json(
      { error: 'Failed to fetch inventory movements' },
      { status: 500 }
    )
  }
}
