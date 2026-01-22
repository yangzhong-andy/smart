import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PUT - 更新供应商-产品关联
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { price, moq, leadTime, isPrimary } = body;

    // 如果设置为主供应商，先取消该产品的其他主供应商
    if (isPrimary) {
      const current = await prisma.productSupplier.findUnique({
        where: { id },
        include: { product: true },
      });

      if (current) {
        await prisma.productSupplier.updateMany({
          where: {
            productId: current.productId,
            isPrimary: true,
            id: { not: id }, // 排除当前记录
          },
          data: {
            isPrimary: false,
          },
        });
      }
    }

    const productSupplier = await prisma.productSupplier.update({
      where: { id },
      data: {
        price: price !== undefined ? (price ? Number(price) : null) : undefined,
        moq: moq !== undefined ? (moq ? Number(moq) : null) : undefined,
        leadTime: leadTime !== undefined ? (leadTime ? Number(leadTime) : null) : undefined,
        isPrimary: isPrimary !== undefined ? isPrimary : undefined,
      },
      include: {
        product: true,
        supplier: true,
      },
    });

    return NextResponse.json(productSupplier);
  } catch (error) {
    console.error(`Error updating product-supplier ${params.id}:`, error);
    return NextResponse.json(
      { error: 'Failed to update product-supplier' },
      { status: 500 }
    );
  }
}

// DELETE - 删除供应商-产品关联
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.productSupplier.delete({ where: { id } });
    return NextResponse.json({ message: 'Product-supplier relationship deleted successfully' });
  } catch (error) {
    console.error(`Error deleting product-supplier ${params.id}:`, error);
    return NextResponse.json(
      { error: 'Failed to delete product-supplier' },
      { status: 500 }
    );
  }
}
