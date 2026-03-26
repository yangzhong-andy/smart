import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - 获取某个 SKU 的所有箱规
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const variantId = searchParams.get('variantId')

    if (!variantId) {
      return NextResponse.json({ error: '缺少 variantId 参数' }, { status: 400 })
    }

    const boxSpecs = await prisma.boxSpec.findMany({
      where: { variantId },
      orderBy: { isDefault: 'desc' }, // 默认箱规排前面
    })

    return NextResponse.json(boxSpecs.map(b => ({
      id: b.id,
      variantId: b.variantId,
      boxLengthCm: b.boxLengthCm ? Number(b.boxLengthCm) : null,
      boxWidthCm: b.boxWidthCm ? Number(b.boxWidthCm) : null,
      boxHeightCm: b.boxHeightCm ? Number(b.boxHeightCm) : null,
      qtyPerBox: b.qtyPerBox,
      isDefault: b.isDefault,
      weightKg: b.weightKg ? Number(b.weightKg) : null,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })))
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - 创建箱规
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { variantId, boxLengthCm, boxWidthCm, boxHeightCm, qtyPerBox, isDefault, weightKg } = body

    if (!variantId || !qtyPerBox) {
      return NextResponse.json({ error: 'variantId 和 qtyPerBox 是必填项' }, { status: 400 })
    }

    // 如果设为默认箱规，先取消其他默认
    if (isDefault) {
      await prisma.boxSpec.updateMany({
        where: { variantId, isDefault: true },
        data: { isDefault: false },
      })
    }

    const boxSpec = await prisma.boxSpec.create({
      data: {
        variantId,
        boxLengthCm: boxLengthCm ? parseFloat(String(boxLengthCm)) : null,
        boxWidthCm: boxWidthCm ? parseFloat(String(boxWidthCm)) : null,
        boxHeightCm: boxHeightCm ? parseFloat(String(boxHeightCm)) : null,
        qtyPerBox: parseInt(String(qtyPerBox)),
        isDefault: isDefault || false,
        weightKg: weightKg ? parseFloat(String(weightKg)) : null,
      },
    })

    return NextResponse.json({
      id: boxSpec.id,
      variantId: boxSpec.variantId,
      boxLengthCm: boxSpec.boxLengthCm ? Number(boxSpec.boxLengthCm) : null,
      boxWidthCm: boxSpec.boxWidthCm ? Number(boxSpec.boxWidthCm) : null,
      boxHeightCm: boxSpec.boxHeightCm ? Number(boxSpec.boxHeightCm) : null,
      qtyPerBox: boxSpec.qtyPerBox,
      isDefault: boxSpec.isDefault,
      weightKg: boxSpec.weightKg ? Number(boxSpec.weightKg) : null,
      createdAt: boxSpec.createdAt.toISOString(),
      updatedAt: boxSpec.updatedAt.toISOString(),
    }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - 更新箱规
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, boxLengthCm, boxWidthCm, boxHeightCm, qtyPerBox, isDefault, weightKg } = body

    if (!id) {
      return NextResponse.json({ error: '缺少箱规 ID' }, { status: 400 })
    }

    // 如果设为默认箱规，先取消其他默认
    if (isDefault) {
      const existing = await prisma.boxSpec.findUnique({ where: { id } })
      if (existing) {
        await prisma.boxSpec.updateMany({
          where: { variantId: existing.variantId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }
    }

    const boxSpec = await prisma.boxSpec.update({
      where: { id },
      data: {
        boxLengthCm: boxLengthCm !== undefined ? (boxLengthCm ? parseFloat(String(boxLengthCm)) : null) : undefined,
        boxWidthCm: boxWidthCm !== undefined ? (boxWidthCm ? parseFloat(String(boxWidthCm)) : null) : undefined,
        boxHeightCm: boxHeightCm !== undefined ? (boxHeightCm ? parseFloat(String(boxHeightCm)) : null) : undefined,
        qtyPerBox: qtyPerBox !== undefined ? parseInt(String(qtyPerBox)) : undefined,
        isDefault: isDefault !== undefined ? isDefault : undefined,
        weightKg: weightKg !== undefined ? (weightKg ? parseFloat(String(weightKg)) : null) : undefined,
      },
    })

    return NextResponse.json({
      id: boxSpec.id,
      variantId: boxSpec.variantId,
      boxLengthCm: boxSpec.boxLengthCm ? Number(boxSpec.boxLengthCm) : null,
      boxWidthCm: boxSpec.boxWidthCm ? Number(boxSpec.boxWidthCm) : null,
      boxHeightCm: boxSpec.boxHeightCm ? Number(boxSpec.boxHeightCm) : null,
      qtyPerBox: boxSpec.qtyPerBox,
      isDefault: boxSpec.isDefault,
      weightKg: boxSpec.weightKg ? Number(boxSpec.weightKg) : null,
      updatedAt: boxSpec.updatedAt.toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - 删除箱规
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: '缺少箱规 ID' }, { status: 400 })
    }

    await prisma.boxSpec.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}