export const dynamic = 'force-dynamic';
import { getServerSession } from "next-auth";
import { authOptions } from '@/lib/auth-options'
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    return NextResponse.json(session);
  } catch (error) {
    console.error("Session error:", error);
    return NextResponse.json({ error: "Failed to get session" }, { status: 500 });
  }
}
