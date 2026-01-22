import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'

// GET - 获取所有店铺
export async function GET() {
  try {
    const stores = await prisma.store.findMany({
      orderBy: { createdAt: 'desc' }
    })

    const transformed = stores.map(s => ({
      id: s.id,
      name: s.name,
      platform: s.platform,
      country: s.country,
      currency: s.currency,
      accountId: s.accountId,
      accountName: s.accountName,
      vatNumber: s.vatNumber || undefined,
      taxId: s.taxId || undefined,
      createdAt: s.createdAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching stores:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stores' },
      { status: 500 }
    )
  }
}

// POST - 创建新店铺
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const store = await prisma.store.create({
      data: {
        name: body.name,
        platform: body.platform as Platform,
        country: body.country,
        currency: body.currency,
        accountId: body.accountId,
        accountName: body.accountName,
        vatNumber: body.vatNumber || null,
        taxId: body.taxId || null
      }
    })

    return NextResponse.json({
      id: store.id,
      name: store.name,
      platform: store.platform,
      country: store.country,
      currency: store.currency,
      accountId: store.accountId,
      accountName: store.accountName,
      vatNumber: store.vatNumber || undefined,
      taxId: store.taxId || undefined,
      createdAt: store.createdAt.toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating store:', error)
    return NextResponse.json(
      { error: 'Failed to create store' },
      { status: 500 }
    )
  }
}
