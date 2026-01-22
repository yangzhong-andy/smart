import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'

// GET - 获取所有店铺
export async function GET() {
  try {
    const stores = await prisma.store.findMany({
      orderBy: { createdAt: 'desc' }
    })

    // 转换平台格式：数据库枚举转前端字符串
    const platformToFrontend: Record<Platform, string> = {
      [Platform.TIKTOK]: 'TikTok',
      [Platform.AMAZON]: 'Amazon',
      [Platform.INSTAGRAM]: 'Instagram',
      [Platform.YOUTUBE]: 'YouTube',
      [Platform.OTHER]: '其他'
    };

    const transformed = stores.map(s => ({
      id: s.id,
      name: s.name,
      platform: platformToFrontend[s.platform] as 'TikTok' | 'Amazon' | '其他',
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

    // 转换平台格式：前端使用 "TikTok", "Amazon" 等，数据库使用 Platform 枚举
    const platformToEnum: Record<string, Platform> = {
      'TikTok': Platform.TIKTOK,
      'Amazon': Platform.AMAZON,
      'Instagram': Platform.INSTAGRAM,
      'YouTube': Platform.YOUTUBE,
      '其他': Platform.OTHER
    };
    
    const store = await prisma.store.create({
      data: {
        name: body.name,
        platform: platformToEnum[body.platform] || Platform.OTHER,
        country: body.country,
        currency: body.currency,
        accountId: body.accountId || null,
        accountName: body.accountName || null,
        vatNumber: body.vatNumber || null,
        taxId: body.taxId || null
      }
    })

    // 转换平台格式：数据库枚举转前端字符串
    const platformToFrontend: Record<Platform, string> = {
      [Platform.TIKTOK]: 'TikTok',
      [Platform.AMAZON]: 'Amazon',
      [Platform.INSTAGRAM]: 'Instagram',
      [Platform.YOUTUBE]: 'YouTube',
      [Platform.OTHER]: '其他'
    };

    return NextResponse.json({
      id: store.id,
      name: store.name,
      platform: platformToFrontend[store.platform] as 'TikTok' | 'Amazon' | '其他',
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
