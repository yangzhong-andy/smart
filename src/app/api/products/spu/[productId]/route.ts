import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * DELETE 删除整个产品（SPU）及其全部变体（SKU）
 * 会级联删除 ProductVariant、ProductSupplier 等关联数据
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const productId = params.productId
    if (!productId) {
      return NextResponse.json({ error: '缺少 productId' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { id: true, skuId: true } } }
    })

    if (!product) {
      return NextResponse.json({ error: '产品不存在' }, { status: 404 })
    }

    // 删除 Product 会级联删除 ProductVariant、ProductSupplier（schema 中 onDelete: Cascade）
    await prisma.product.delete({
      where: { id: productId }
    })

    return NextResponse.json({
      message: '产品及全部变体已删除',
      deletedVariants: product.variants.length
    })
  } catch (error) {
    console.error('Error deleting product (SPU):', error)
    return NextResponse.json(
      { error: '删除产品失败' },
      { status: 500 }
    )
  }
}
