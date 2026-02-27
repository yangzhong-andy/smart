import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'
import { badRequest, serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟
const CACHE_KEY_PREFIX = 'suppliers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "500")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      category || 'all',
      String(page),
      String(pageSize)
    );

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    const where: any = {}
    if (category) where.category = category

    const [suppliers, total] = await prisma.$transaction([
      prisma.supplier.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.supplier.count({ where }),
    ])

    const response = {
      data: suppliers.map(s => ({
        id: s.id,
        name: s.name,
        contact: s.contact,
        phone: s.phone,
        address: s.address ?? undefined,
        depositRate: Number(s.depositRate) || 0,
        tailPeriodDays: s.tailPeriodDays || 0,
        settleBase: s.settleBase,
        level: s.level ?? undefined,
        category: s.category ?? undefined,
        bankAccount: s.bankAccount ?? undefined,
        bankName: s.bankName ?? undefined,
        taxId: s.taxId ?? undefined,
        invoiceRequirement: s.invoiceRequirement ?? undefined,
        invoicePoint: s.invoicePoint ? Number(s.invoicePoint) : undefined,
        defaultLeadTime: s.defaultLeadTime ?? undefined,
        moq: s.moq ?? undefined,
        factoryImages: s.factoryImages ? (Array.isArray(s.factoryImages) ? s.factoryImages : [s.factoryImages]) : undefined,
        isActive: true,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    };

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL);
    }

    return NextResponse.json(response)
  } catch (error) {
    return serverError('Failed to fetch suppliers')
  }
}

// POST - 创建新供应商
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const supplier = await prisma.supplier.create({
      data: {
        name: body.name,
        contact: body.contact ?? '',
        phone: body.phone ?? '',
        depositRate: body.depositRate ?? 0,
        tailPeriodDays: body.tailPeriodDays ?? 0,
        settleBase: (body.settleBase ?? 'SHIPMENT') as any,
        level: body.level ?? null,
        category: body.category ?? null,
        address: body.address ?? null,
        bankAccount: body.bankAccount ?? null,
        bankName: body.bankName ?? null,
        taxId: body.taxId ?? null,
        invoiceRequirement: body.invoiceRequirement ?? null,
        invoicePoint: body.invoicePoint ?? null,
        defaultLeadTime: body.defaultLeadTime ?? null,
        moq: body.moq ?? null,
      }
    })

    // 清除供应商相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      phone: supplier.phone,
      depositRate: Number(supplier.depositRate),
      tailPeriodDays: supplier.tailPeriodDays,
      settleBase: supplier.settleBase,
      isActive: true,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    })
  } catch (error) {
    return serverError('Failed to create supplier')
  }
}

// PUT - 更新供应商
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body
    
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name: data.name,
        contact: data.contact,
        phone: data.phone,
        depositRate: data.depositRate ?? 0,
        tailPeriodDays: data.tailPeriodDays ?? 0,
        settleBase: (data.settleBase ?? 'SHIPMENT') as any,
        level: data.level ?? null,
        category: data.category ?? null,
        address: data.address ?? null,
        bankAccount: data.bankAccount ?? null,
        bankName: data.bankName ?? null,
        taxId: data.taxId ?? null,
        invoiceRequirement: data.invoiceRequirement ?? null,
        invoicePoint: data.invoicePoint ?? null,
        defaultLeadTime: data.defaultLeadTime ?? null,
        moq: data.moq ?? null,
      }
    })

    // 清除供应商相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({
      id: supplier.id,
      name: supplier.name,
      contact: supplier.contact,
      phone: supplier.phone,
      depositRate: Number(supplier.depositRate),
      tailPeriodDays: supplier.tailPeriodDays,
      settleBase: supplier.settleBase,
      isActive: true,
      createdAt: supplier.createdAt.toISOString(),
      updatedAt: supplier.updatedAt.toISOString(),
    })
  } catch (error) {
    return serverError('Failed to update supplier')
  }
}

// DELETE - 删除供应商
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    
    if (!id) {
      return badRequest('Missing supplier id')
    }
    
    await prisma.supplier.delete({ where: { id } })

    // 清除供应商相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX);

    return NextResponse.json({ success: true })
  } catch (error) {
    return serverError('Failed to delete supplier')
  }
}
