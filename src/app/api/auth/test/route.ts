import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { requireApiUser } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ['ADMIN', 'SUPER_ADMIN'] })
  if (auth.response) return auth.response

  try {
    const session = await getServerSession(authOptions)
    
    return NextResponse.json({
      success: true,
      session: session ? {
        user: {
          email: session.user?.email,
          name: session.user?.name,
        },
        expires: session.expires
      } : null,
      message: 'NextAuth API 正常工作'
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
