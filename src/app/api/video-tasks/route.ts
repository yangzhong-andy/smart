import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { VideoTaskStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

// 状态映射
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

// GET - 获取所有视频任务
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const influencerId = searchParams.get('influencerId')
    const assigneeId = searchParams.get('assigneeId')
    const status = searchParams.get('status')

    const where: any = {}
    if (productId) where.productId = productId
    if (influencerId) where.influencerId = influencerId
    if (assigneeId) where.assigneeId = assigneeId
    if (status) where.status = STATUS_MAP_FRONT_TO_DB[status] || status as VideoTaskStatus

    const tasks = await prisma.videoTask.findMany({
      where,
      include: {
        product: true,
        influencer: true,
        assignee: true
      },
      orderBy: { createdAt: 'desc' }
    })

    const transformed = tasks.map(t => ({
      id: t.id,
      title: t.title,
      brief: t.brief || undefined,
      productId: t.productId || undefined,
      influencerId: t.influencerId || undefined,
      assigneeId: t.assigneeId || undefined,
      status: STATUS_MAP_DB_TO_FRONT[t.status],
      dueDate: t.dueDate?.toISOString() || undefined,
      videoUrl: t.videoUrl || undefined,
      notes: t.notes || undefined,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString()
    }))

    return NextResponse.json(transformed)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch video tasks' },
      { status: 500 }
    )
  }
}

// POST - 创建新视频任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const task = await prisma.videoTask.create({
      data: {
        title: body.title,
        brief: body.brief || null,
        productId: body.productId || null,
        influencerId: body.influencerId || null,
        assigneeId: body.assigneeId || null,
        status: STATUS_MAP_FRONT_TO_DB[body.status] || VideoTaskStatus.TODO,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        videoUrl: body.videoUrl || null,
        notes: body.notes || null
      }
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
    }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create video task' },
      { status: 500 }
    )
  }
}
