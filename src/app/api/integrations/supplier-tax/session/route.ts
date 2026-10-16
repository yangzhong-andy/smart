import { NextRequest, NextResponse } from 'next/server';
import { getApiUser } from '@/lib/api-auth';
import { supplierTaxRole } from '@/lib/supplier-tax-access';

export const dynamic = 'force-dynamic';

// Use the same verified, active database user as the rest of ERP. Never trust
// a caller-supplied user ID, name or role, or return the ERP session token.
export async function GET(request: NextRequest) {
  const user = await getApiUser(request);
  if (!user) return NextResponse.json({ error: '请先登录ERP' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const role = supplierTaxRole(user);
  return NextResponse.json({ user: { id: `erp:${user.id}`, username: user.email, name: user.name || user.email, role } },
    { headers: { 'Cache-Control': 'no-store' } });
}
