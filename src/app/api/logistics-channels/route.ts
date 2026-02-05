import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取所有物流渠道
export async function GET() {
  try {
    const channels = await prisma.logisticsChannel.findMany({
      orderBy: { createdAt: 'desc' }
    })

    const transformed = channels.map(c => ({
      id: c.id,
      name: c.name,
      channelCode: c.channelCode,
      contact: c.contact,
      phone: c.phone,
      queryUrl: c.queryUrl,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    console.error('Error fetching logistics channels:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logistics channels' },
      { status: 500 }
    )
  }
}

// POST - 创建新物流渠道
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const channel = await prisma.logisticsChannel.create({
      data: {
        name: body.name,
        channelCode: body.channelCode,
        contact: body.contact,
        phone: body.phone,
        queryUrl: body.queryUrl
      }
    })

    return NextResponse.json({
      id: channel.id,
      name: channel.name,
      channelCode: channel.channelCode,
      contact: channel.contact,
      phone: channel.phone,
      queryUrl: channel.queryUrl,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating logistics channel:', error)
    return NextResponse.json(
      { error: 'Failed to create logistics channel' },
      { status: 500 }
    )
  }
}
