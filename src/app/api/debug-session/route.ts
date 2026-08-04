import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth-options'
import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ['ADMIN', 'SUPER_ADMIN'] })
  if (auth.response) return auth.response

  try {
    const session = await getServerSession(authOptions);
    return NextResponse.json({
      hasSession: !!session,
      session: session,
      user: session?.user || null,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
