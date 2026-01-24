import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth-options'
import { NextResponse } from "next/server";

export async function GET() {
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
