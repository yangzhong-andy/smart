import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取单个物流渠道
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const channel = await prisma.logisticsChannel.findUnique({
      where: { id: params.id }
    })

    if (!channel) {
      return NextResponse.json(
        { error: 'Logistics channel not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: channel.id,
      name: channel.name,
      channelCode: channel.channelCode,
      contact: channel.contact,
      phone: channel.phone,
      queryUrl: channel.queryUrl,
      createdAt: channel.createdAt.toISOString(),
      updatedAt: channel.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching logistics channel:', error)
    return NextResponse.json(
      { error: 'Failed to fetch logistics channel' },
      { status: 500 }
    )
  }
}

// PUT - 更新物流渠道
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.channelCode !== undefined) updateData.channelCode = body.channelCode
    if (body.contact !== undefined) updateData.contact = body.contact
    if (body.phone !== undefined) updateData.phone = body.phone
    if (body.queryUrl !== undefined) updateData.queryUrl = body.queryUrl

    const channel = await prisma.logisticsChannel.update({
      where: { id: params.id },
      data: updateData
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
    })
  } catch (error) {
    console.error('Error updating logistics channel:', error)
    return NextResponse.json(
      { error: 'Failed to update logistics channel' },
      { status: 500 }
    )
  }
}

// DELETE - 删除物流渠道
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.logisticsChannel.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting logistics channel:', error)
    return NextResponse.json(
      { error: 'Failed to delete logistics channel' },
      { status: 500 }
    )
  }
}
