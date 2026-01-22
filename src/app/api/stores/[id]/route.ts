import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'

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
      return NextResponse.json(
        { error: 'Store not found' },
        { status: 404 }
      )
    }

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
    })
  } catch (error) {
    console.error('Error fetching store:', error)
    return NextResponse.json(
      { error: 'Failed to fetch store' },
      { status: 500 }
    )
  }
}

// PUT - 更新店铺
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.platform !== undefined) updateData.platform = body.platform as Platform
    if (body.country !== undefined) updateData.country = body.country
    if (body.currency !== undefined) updateData.currency = body.currency
    if (body.accountId !== undefined) updateData.accountId = body.accountId
    if (body.accountName !== undefined) updateData.accountName = body.accountName
    if (body.vatNumber !== undefined) updateData.vatNumber = body.vatNumber || null
    if (body.taxId !== undefined) updateData.taxId = body.taxId || null

    const store = await prisma.store.update({
      where: { id: params.id },
      data: updateData
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
    })
  } catch (error) {
    console.error('Error updating store:', error)
    return NextResponse.json(
      { error: 'Failed to update store' },
      { status: 500 }
    )
  }
}

// DELETE - 删除店铺
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.store.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting store:', error)
    return NextResponse.json(
      { error: 'Failed to delete store' },
      { status: 500 }
    )
  }
}
