import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Platform } from '@prisma/client'

export const dynamic = 'force-dynamic'

// GET - 获取所有网红/达人
export async function GET() {
  try {
    const influencers = await prisma.influencer.findMany({
      orderBy: { createdAt: 'desc' }
    })

    const transformed = influencers.map(i => ({
      id: i.id,
      accountName: i.accountName,
      platform: i.platform,
      accountUrl: i.accountUrl || undefined,
      followerCount: i.followerCount,
      contactInfo: i.contactInfo,
      category: i.category,
      cooperationStatus: i.cooperationStatus,
      sampleStatus: i.sampleStatus,
      sampleOrderNumber: i.sampleOrderNumber || undefined,
      sampleTrackingNumber: i.sampleTrackingNumber || undefined,
      sampleProductSku: i.sampleProductSku || undefined,
      sampleProductId: i.sampleProductId || undefined,
      sampleSentAt: i.sampleSentAt?.toISOString() || undefined,
      sampleReceivedAt: i.sampleReceivedAt?.toISOString() || undefined,
      historicalEngagementRate: i.historicalEngagementRate ? Number(i.historicalEngagementRate) : undefined,
      estimatedOrders: i.estimatedOrders || undefined,
      actualOrders: i.actualOrders || undefined,
      notes: i.notes || undefined,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching influencers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch influencers' },
      { status: 500 }
    )
  }
}

// POST - 创建新网红/达人
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const influencer = await prisma.influencer.create({
      data: {
        accountName: body.accountName,
        platform: body.platform as Platform,
        accountUrl: body.accountUrl || null,
        followerCount: body.followerCount,
        contactInfo: body.contactInfo,
        category: body.category,
        cooperationStatus: body.cooperationStatus,
        sampleStatus: body.sampleStatus,
        sampleOrderNumber: body.sampleOrderNumber || null,
        sampleTrackingNumber: body.sampleTrackingNumber || null,
        sampleProductSku: body.sampleProductSku || null,
        sampleProductId: body.sampleProductId || null,
        sampleSentAt: body.sampleSentAt ? new Date(body.sampleSentAt) : null,
        sampleReceivedAt: body.sampleReceivedAt ? new Date(body.sampleReceivedAt) : null,
        historicalEngagementRate: body.historicalEngagementRate ? Number(body.historicalEngagementRate) : null,
        estimatedOrders: body.estimatedOrders || null,
        actualOrders: body.actualOrders || null,
        notes: body.notes || null
      }
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
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating influencer:', error)
    return NextResponse.json(
      { error: 'Failed to create influencer' },
      { status: 500 }
    )
  }
}
