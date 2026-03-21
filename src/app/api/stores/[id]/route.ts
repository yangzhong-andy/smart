import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'
import { notFound, handlePrismaError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// GET - 获取单个店铺
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const store = await prisma.store.findUnique({
      where: { id: params.id }
    })

    if (!store) {
      return notFound('Store not found')
    }

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
    })
  } catch (error) {
    return handlePrismaError(error, { notFoundMessage: 'Store not found', serverMessage: 'Failed to fetch store' })
  }
}

// PUT - 更新店铺
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

    // 转换平台格式：前端使用 "TikTok", "Amazon" 等，数据库使用 Platform 枚举
    const platformToEnum: Record<string, Platform> = {
      'TikTok': Platform.TIKTOK,
      'Amazon': Platform.AMAZON,
      'Instagram': Platform.INSTAGRAM,
      'YouTube': Platform.YOUTUBE,
      '其他': Platform.OTHER
    };

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
      if (body.platform !== undefined) updateData.platform = platformToEnum[body.platform] || Platform.OTHER
    if (body.country !== undefined) updateData.country = body.country
    if (body.currency !== undefined) updateData.currency = body.currency
    // 与 schema 中非可选 String 一致：清空关联时用空字符串，不能写 null
    if (body.accountId !== undefined) updateData.accountId = body.accountId ? String(body.accountId) : ''
    if (body.accountName !== undefined) updateData.accountName = body.accountName ? String(body.accountName) : ''
    if (body.vatNumber !== undefined) updateData.vatNumber = body.vatNumber || null
    if (body.taxId !== undefined) updateData.taxId = body.taxId || null

    const store = await prisma.store.update({
      where: { id: params.id },
      data: updateData
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
    })
  } catch (error) {
    return handlePrismaError(error, { notFoundMessage: 'Store not found', serverMessage: 'Failed to update store' })
  }
}

// DELETE - 删除店铺
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

    await prisma.store.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handlePrismaError(error, { notFoundMessage: 'Store not found', serverMessage: 'Failed to delete store' })
  }
}
