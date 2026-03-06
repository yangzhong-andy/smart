import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serverError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

const PROFILE_ID = 'default'

/** GET /api/company - 获取本公司（甲方）信息，供设置页展示与合同生成使用 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const row = await prisma.companyProfile.findUnique({
      where: { id: PROFILE_ID },
    })
    return NextResponse.json({
      name: row?.name ?? '',
      address: row?.address ?? '',
      phone: row?.phone ?? '',
      contact: row?.contact ?? '',
      bankAccount: row?.bankAccount ?? '',
      bankAccountName: row?.bankAccountName ?? '',
      bankName: row?.bankName ?? '',
      taxId: row?.taxId ?? '',
    })
  } catch (error: any) {
    return serverError('获取公司信息失败', error)
  }
}

/** PATCH /api/company - 更新本公司信息（仅登录用户可修改） */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const body = await request.json()
    const data = {
      name: body.name != null ? String(body.name).trim() : undefined,
      address: body.address != null ? String(body.address).trim() : undefined,
      phone: body.phone != null ? String(body.phone).trim() : undefined,
      contact: body.contact != null ? String(body.contact).trim() : undefined,
      bankAccount: body.bankAccount != null ? String(body.bankAccount).trim() : undefined,
      bankAccountName: body.bankAccountName != null ? String(body.bankAccountName).trim() : undefined,
      bankName: body.bankName != null ? String(body.bankName).trim() : undefined,
      taxId: body.taxId != null ? String(body.taxId).trim() : undefined,
    }
    const updated = await prisma.companyProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...data },
      update: data,
    })
    return NextResponse.json({
      name: updated.name ?? '',
      address: updated.address ?? '',
      phone: updated.phone ?? '',
      contact: updated.contact ?? '',
      bankAccount: updated.bankAccount ?? '',
      bankAccountName: updated.bankAccountName ?? '',
      bankName: updated.bankName ?? '',
      taxId: updated.taxId ?? '',
    })
  } catch (error: any) {
    return serverError('更新公司信息失败', error)
  }
}
