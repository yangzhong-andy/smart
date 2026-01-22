import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'

// GET - 获取单个网红/达人
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const influencer = await prisma.influencer.findUnique({
      where: { id: params.id }
    })

    if (!influencer) {
      return NextResponse.json(
        { error: 'Influencer not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: influencer.id,
      accountName: influencer.accountName,
      platform: influencer.platform,
      accountUrl: influencer.accountUrl || undefined,
      followerCount: influencer.followerCount,
      contactInfo: influencer.contactInfo,
      category: influencer.category,
      cooperationStatus: influencer.cooperationStatus,
      sampleStatus: influencer.sampleStatus,
      sampleOrderNumber: influencer.sampleOrderNumber || undefined,
      sampleTrackingNumber: influencer.sampleTrackingNumber || undefined,
      sampleProductSku: influencer.sampleProductSku || undefined,
      sampleProductId: influencer.sampleProductId || undefined,
      sampleSentAt: influencer.sampleSentAt?.toISOString() || undefined,
      sampleReceivedAt: influencer.sampleReceivedAt?.toISOString() || undefined,
      historicalEngagementRate: influencer.historicalEngagementRate ? Number(influencer.historicalEngagementRate) : undefined,
      estimatedOrders: influencer.estimatedOrders || undefined,
      actualOrders: influencer.actualOrders || undefined,
      notes: influencer.notes || undefined,
      createdAt: influencer.createdAt.toISOString(),
      updatedAt: influencer.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching influencer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch influencer' },
      { status: 500 }
    )
  }
}

// PUT - 更新网红/达人
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.accountName !== undefined) updateData.accountName = body.accountName
    if (body.platform !== undefined) updateData.platform = body.platform as Platform
    if (body.accountUrl !== undefined) updateData.accountUrl = body.accountUrl || null
    if (body.followerCount !== undefined) updateData.followerCount = body.followerCount
    if (body.contactInfo !== undefined) updateData.contactInfo = body.contactInfo
    if (body.category !== undefined) updateData.category = body.category
    if (body.cooperationStatus !== undefined) updateData.cooperationStatus = body.cooperationStatus
    if (body.sampleStatus !== undefined) updateData.sampleStatus = body.sampleStatus
    if (body.sampleOrderNumber !== undefined) updateData.sampleOrderNumber = body.sampleOrderNumber || null
    if (body.sampleTrackingNumber !== undefined) updateData.sampleTrackingNumber = body.sampleTrackingNumber || null
    if (body.sampleProductSku !== undefined) updateData.sampleProductSku = body.sampleProductSku || null
    if (body.sampleProductId !== undefined) updateData.sampleProductId = body.sampleProductId || null
    if (body.sampleSentAt !== undefined) updateData.sampleSentAt = body.sampleSentAt ? new Date(body.sampleSentAt) : null
    if (body.sampleReceivedAt !== undefined) updateData.sampleReceivedAt = body.sampleReceivedAt ? new Date(body.sampleReceivedAt) : null
    if (body.historicalEngagementRate !== undefined) updateData.historicalEngagementRate = body.historicalEngagementRate ? Number(body.historicalEngagementRate) : null
    if (body.estimatedOrders !== undefined) updateData.estimatedOrders = body.estimatedOrders || null
    if (body.actualOrders !== undefined) updateData.actualOrders = body.actualOrders || null
    if (body.notes !== undefined) updateData.notes = body.notes || null

    const influencer = await prisma.influencer.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({
      id: influencer.id,
      accountName: influencer.accountName,
      platform: influencer.platform,
      accountUrl: influencer.accountUrl || undefined,
      followerCount: influencer.followerCount,
      contactInfo: influencer.contactInfo,
      category: influencer.category,
      cooperationStatus: influencer.cooperationStatus,
      sampleStatus: influencer.sampleStatus,
      sampleOrderNumber: influencer.sampleOrderNumber || undefined,
      sampleTrackingNumber: influencer.sampleTrackingNumber || undefined,
      sampleProductSku: influencer.sampleProductSku || undefined,
      sampleProductId: influencer.sampleProductId || undefined,
      sampleSentAt: influencer.sampleSentAt?.toISOString() || undefined,
      sampleReceivedAt: influencer.sampleReceivedAt?.toISOString() || undefined,
      historicalEngagementRate: influencer.historicalEngagementRate ? Number(influencer.historicalEngagementRate) : undefined,
      estimatedOrders: influencer.estimatedOrders || undefined,
      actualOrders: influencer.actualOrders || undefined,
      notes: influencer.notes || undefined,
      createdAt: influencer.createdAt.toISOString(),
      updatedAt: influencer.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error updating influencer:', error)
    return NextResponse.json(
      { error: 'Failed to update influencer' },
      { status: 500 }
    )
  }
}

// DELETE - 删除网红/达人
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.influencer.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting influencer:', error)
    return NextResponse.json(
      { error: 'Failed to delete influencer' },
      { status: 500 }
    )
  }
}
