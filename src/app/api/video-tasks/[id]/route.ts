import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { VideoTaskStatus } from '@prisma/client'

const STATUS_MAP_DB_TO_FRONT: Record<VideoTaskStatus, string> = {
  TODO: '待办',
  IN_PROGRESS: '进行中',
  REVIEW: '待审核',
  DONE: '已完成',
  CANCELLED: '已取消'
}

const STATUS_MAP_FRONT_TO_DB: Record<string, VideoTaskStatus> = {
  '待办': VideoTaskStatus.TODO,
  '进行中': VideoTaskStatus.IN_PROGRESS,
  '待审核': VideoTaskStatus.REVIEW,
  '已完成': VideoTaskStatus.DONE,
  '已取消': VideoTaskStatus.CANCELLED
}

// GET - 获取单个视频任务
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const task = await prisma.videoTask.findUnique({
      where: { id: params.id },
      include: {
        product: true,
        influencer: true,
        assignee: true
      }
    })

    if (!task) {
      return NextResponse.json(
        { error: 'Video task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: task.id,
      title: task.title,
      brief: task.brief || undefined,
      productId: task.productId || undefined,
      influencerId: task.influencerId || undefined,
      assigneeId: task.assigneeId || undefined,
      status: STATUS_MAP_DB_TO_FRONT[task.status],
      dueDate: task.dueDate?.toISOString() || undefined,
      videoUrl: task.videoUrl || undefined,
      notes: task.notes || undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error fetching video task:', error)
    return NextResponse.json(
      { error: 'Failed to fetch video task' },
      { status: 500 }
    )
  }
}

// PUT - 更新视频任务
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()

    const updateData: any = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.brief !== undefined) updateData.brief = body.brief || null
    if (body.productId !== undefined) updateData.productId = body.productId || null
    if (body.influencerId !== undefined) updateData.influencerId = body.influencerId || null
    if (body.assigneeId !== undefined) updateData.assigneeId = body.assigneeId || null
    if (body.status !== undefined) updateData.status = STATUS_MAP_FRONT_TO_DB[body.status] || VideoTaskStatus.TODO
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body.videoUrl !== undefined) updateData.videoUrl = body.videoUrl || null
    if (body.notes !== undefined) updateData.notes = body.notes || null

    const task = await prisma.videoTask.update({
      where: { id: params.id },
      data: updateData
    })

    return NextResponse.json({
      id: task.id,
      title: task.title,
      brief: task.brief || undefined,
      productId: task.productId || undefined,
      influencerId: task.influencerId || undefined,
      assigneeId: task.assigneeId || undefined,
      status: STATUS_MAP_DB_TO_FRONT[task.status],
      dueDate: task.dueDate?.toISOString() || undefined,
      videoUrl: task.videoUrl || undefined,
      notes: task.notes || undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('Error updating video task:', error)
    return NextResponse.json(
      { error: 'Failed to update video task' },
      { status: 500 }
    )
  }
}

// DELETE - 删除视频任务
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.videoTask.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting video task:', error)
    return NextResponse.json(
      { error: 'Failed to delete video task' },
      { status: 500 }
    )
  }
}
