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

// GET - 获取单条供应商档案
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const p = await prisma.supplierProfile.findUnique({ where: { id } });
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error('Error fetching supplier profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier profile', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - 更新供应商档案
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, type, contact, phone, email, address, rebateRate, settlementDay, creditTerm, currency, agencyId, supplierId, notes } = body;

    const prismaType = type != null && (typeFromFront[type] || type === 'AD_AGENCY' || type === 'LOGISTICS' || type === 'VENDOR')
      ? (typeFromFront[type] ?? type)
      : undefined;

    const p = await prisma.supplierProfile.update({
      where: { id },
      data: {
        ...(name != null && { name: String(name).trim() }),
        ...(prismaType != null && { type: prismaType }),
        ...(contact != null && { contact: String(contact).trim() }),
        ...(phone != null && { phone: String(phone).trim() }),
        ...(email !== undefined && { email: email ? String(email).trim() : null }),
        ...(address !== undefined && { address: address ? String(address).trim() : null }),
        ...(rebateRate !== undefined && { rebateRate: rebateRate != null ? Number(rebateRate) : null }),
        ...(settlementDay !== undefined && { settlementDay: settlementDay != null ? Number(settlementDay) : null }),
        ...(creditTerm !== undefined && { creditTerm: creditTerm ? String(creditTerm) : null }),
        ...(currency !== undefined && { currency: currency ?? null }),
        ...(agencyId !== undefined && { agencyId: agencyId ?? null }),
        ...(supplierId !== undefined && { supplierId: supplierId ?? null }),
        ...(notes !== undefined && { notes: notes ? String(notes) : null })
      }
    });

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error('Error updating supplier profile:', error);
    return NextResponse.json(
      { error: 'Failed to update supplier profile', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - 删除供应商档案
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.supplierProfile.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Error deleting supplier profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete supplier profile', details: error.message },
      { status: 500 }
    );
  }
}
