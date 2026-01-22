import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - 获取供应商关联的产品
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplierId');
    const productId = searchParams.get('productId');

    if (supplierId) {
      // 查询供应商的所有关联产品
      const productSuppliers = await prisma.productSupplier.findMany({
        where: { supplierId },
        include: {
          product: true,
          supplier: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json(productSuppliers);
    }

    if (productId) {
      // 查询产品的所有关联供应商
      const productSuppliers = await prisma.productSupplier.findMany({
        where: { productId },
        include: {
          product: true,
          supplier: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json(productSuppliers);
    }

    // 如果没有参数，返回所有关联
    const all = await prisma.productSupplier.findMany({
      include: {
        product: true,
        supplier: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(all);
  } catch (error) {
    console.error('Error fetching product-suppliers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product-suppliers' },
      { status: 500 }
    );
  }
}

// POST - 创建供应商-产品关联
export async function POST(request: NextRequest) {
  try {
    // 尝试连接数据库，如果失败则重试
    let retries = 3;
    let lastError: any;
    
    while (retries > 0) {
      try {
        await prisma.$connect();
        break; // 连接成功，退出重试循环
      } catch (error: any) {
        lastError = error;
        retries--;
        
        // 如果是连接错误，等待后重试（给数据库唤醒时间）
        if (error.message?.includes('TLS connection') || error.message?.includes('connection')) {
          if (retries > 0) {
            console.log(`数据库连接失败，${2 - retries + 1}/3 次重试...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
            continue;
          }
        } else {
          // 其他错误直接抛出
          throw error;
        }
      }
    }
    
    // 如果所有重试都失败
    if (retries === 0 && lastError) {
      throw lastError;
    }

    const body = await request.json();
    const { productId, supplierId, price, moq, leadTime, isPrimary } = body;

    console.log('创建产品供应商关联 - 接收到的数据:', { productId, supplierId, isPrimary, price, moq, leadTime });

    if (!productId || !supplierId) {
      return NextResponse.json(
        { error: 'productId and supplierId are required', details: `productId: ${productId}, supplierId: ${supplierId}` },
        { status: 400 }
      );
    }

    // 验证产品是否存在
    let actualProductId = productId;
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      console.log(`通过 id "${productId}" 未找到产品，尝试通过 skuId 查找...`);
      // 如果通过 id 找不到，尝试通过 skuId 查找
      const productBySku = await prisma.product.findUnique({
        where: { skuId: productId },
      });
      
      if (!productBySku) {
        console.error(`产品不存在: id/skuId "${productId}"`);
        return NextResponse.json(
          { error: 'Product not found', details: `Product with id/skuId "${productId}" does not exist` },
          { status: 404 }
        );
      }
      
      // 使用找到的产品的 id
      actualProductId = productBySku.id;
      console.log(`通过 skuId 找到产品，实际 productId: ${actualProductId}`);
    } else {
      console.log(`找到产品: ${product.id} (${product.skuId})`);
    }

    // 验证供应商是否存在
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      console.error(`供应商不存在: id "${supplierId}"`);
      return NextResponse.json(
        { error: 'Supplier not found', details: `Supplier with id "${supplierId}" does not exist` },
        { status: 404 }
      );
    }
    
    console.log(`找到供应商: ${supplier.id} (${supplier.name})`);

    // 检查是否已存在关联
    console.log(`检查是否已存在关联: productId=${actualProductId}, supplierId=${supplierId}`);
    const existing = await prisma.productSupplier.findUnique({
      where: {
        productId_supplierId: {
          productId: actualProductId,
          supplierId,
        },
      },
    });

    if (existing) {
      console.log('关联已存在');
      return NextResponse.json(
        { error: 'Product-supplier relationship already exists', details: '该产品已关联到此供应商' },
        { status: 409 }
      );
    }

    // 如果设置为主供应商，先取消该产品的其他主供应商
    if (isPrimary) {
      console.log('设置为主供应商，取消其他主供应商...');
      await prisma.productSupplier.updateMany({
        where: {
          productId: actualProductId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    console.log('创建产品供应商关联...');
    const productSupplier = await prisma.productSupplier.create({
      data: {
        productId: actualProductId,
        supplierId,
        price: price ? Number(price) : null,
        moq: moq ? Number(moq) : null,
        leadTime: leadTime ? Number(leadTime) : null,
        isPrimary: isPrimary || false,
      },
      include: {
        product: true,
        supplier: true,
      },
    });

    console.log('产品供应商关联创建成功:', productSupplier.id);
    return NextResponse.json(productSupplier, { status: 201 });
  } catch (error: any) {
    console.error('❌ Error creating product-supplier:', error);
    console.error('错误详情:', {
      code: error.code,
      message: error.message,
      meta: error.meta,
      stack: error.stack?.substring(0, 500), // 只显示前500字符
    });
    
    // 检查是否是数据库连接错误
    if (error.message?.includes('TLS connection') || error.message?.includes('connection')) {
      return NextResponse.json(
        { 
          error: '数据库连接失败，请检查 Neon 数据库是否已唤醒',
          details: 'Neon 数据库可能已暂停，请访问 https://console.neon.tech 唤醒数据库'
        },
        { status: 503 }
      );
    }
    
    // 检查是否是表不存在错误
    if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === 'P2021' || error.code === 'P2010') {
      return NextResponse.json(
        { 
          error: '数据库表不存在',
          details: 'ProductSupplier 表可能尚未创建，请运行 migration: npx prisma migrate dev'
        },
        { status: 500 }
      );
    }
    
    // 检查是否是外键约束错误
    if (error.code === 'P2003') {
      const fieldName = error.meta?.field_name || '未知字段';
      return NextResponse.json(
        { 
          error: '关联失败，产品或供应商不存在',
          details: `外键约束失败: ${fieldName}。请检查产品 ID 和供应商 ID 是否正确`
        },
        { status: 400 }
      );
    }
    
    // 检查是否是唯一约束错误
    if (error.code === 'P2002') {
      return NextResponse.json(
        { 
          error: '该产品已关联到此供应商',
          details: '请勿重复关联'
        },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to create product-supplier',
        details: error.message || '未知错误',
        code: error.code,
        meta: error.meta
      },
      { status: 500 }
    );
  }
}
