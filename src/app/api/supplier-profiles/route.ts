import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const typeFromFront: Record<string, 'AD_AGENCY' | 'LOGISTICS' | 'VENDOR'> = {
  广告代理商: 'AD_AGENCY',
  物流商: 'LOGISTICS',
  供货商: 'VENDOR'
};
const typeToFront: Record<string, string> = {
  AD_AGENCY: '广告代理商',
  LOGISTICS: '物流商',
  VENDOR: '供货商'
};

// GET - 获取供应商档案列表（可选 type 筛选，支持中文：广告代理商/物流商/供货商）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');

    const where: { type?: 'AD_AGENCY' | 'LOGISTICS' | 'VENDOR' } = {};
    if (typeParam) {
      const t = typeFromFront[typeParam] ?? (typeParam === 'AD_AGENCY' || typeParam === 'LOGISTICS' || typeParam === 'VENDOR' ? typeParam : null);
      if (t) where.type = t;
    }

    const list = await prisma.supplierProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    const transformed = list.map((p) => ({
      id: p.id,
      name: p.name,
      type: typeToFront[p.type] ?? p.type,
      contact: p.contact,
      phone: p.phone,
      email: p.email ?? undefined,
      address: p.address ?? undefined,
      rebateRate: p.rebateRate != null ? Number(p.rebateRate) : undefined,
      settlementDay: p.settlementDay ?? undefined,
      creditTerm: p.creditTerm ?? undefined,
      currency: p.currency ?? undefined,
      agencyId: p.agencyId ?? undefined,
      supplierId: p.supplierId ?? undefined,
      notes: p.notes ?? undefined,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }));

    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error('Error fetching supplier profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier profiles', details: error.message },
      { status: 500 }
    );
  }
}

// POST - 创建供应商档案
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, type, contact, phone, email, address, rebateRate, settlementDay, creditTerm, currency, agencyId, supplierId, notes } = body;

    if (!name || !type || !contact || !phone) {
      return NextResponse.json(
        { error: 'name, type, contact, phone 不能为空' },
        { status: 400 }
      );
    }

    const prismaType = typeFromFront[type] ?? (type === 'AD_AGENCY' || type === 'LOGISTICS' || type === 'VENDOR' ? type : 'VENDOR');

    const p = await prisma.supplierProfile.create({
      data: {
        name: String(name).trim(),
        type: prismaType,
        contact: String(contact).trim(),
        phone: String(phone).trim(),
        email: email ? String(email).trim() : null,
        address: address ? String(address).trim() : null,
        rebateRate: rebateRate != null ? Number(rebateRate) : null,
        settlementDay: settlementDay != null ? Number(settlementDay) : null,
        creditTerm: creditTerm ? String(creditTerm) : null,
        currency: currency ?? null,
        agencyId: agencyId ?? null,
        supplierId: supplierId ?? null,
        notes: notes ? String(notes) : null
      }
    });

    return NextResponse.json(
      {
        id: p.id,
        name: p.name,
        type: typeToFront[p.type] ?? p.type,
        contact: p.contact,
        phone: p.phone,
        email: p.email ?? undefined,
        address: p.address ?? undefined,
        rebateRate: p.rebateRate != null ? Number(p.rebateRate) : undefined,
        settlementDay: p.settlementDay ?? undefined,
        creditTerm: p.creditTerm ?? undefined,
        currency: p.currency ?? undefined,
        agencyId: p.agencyId ?? undefined,
        supplierId: p.supplierId ?? undefined,
        notes: p.notes ?? undefined,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating supplier profile:', error);
    return NextResponse.json(
      { error: 'Failed to create supplier profile', details: error.message },
      { status: 500 }
    );
  }
}
