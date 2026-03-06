import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import { prisma } from '@/lib/prisma'
import { AccountType, AccountCategory } from '@prisma/client'
import { handlePrismaError } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

// PUT - 更新账户
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    const canEdit = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'MANAGER'
    if (!canEdit) {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()
    
    // 构建更新数据对象
    const updateData: any = {
      name: body.name,
      accountNumber: body.accountNumber,
      accountType: body.accountType === '对公' ? AccountType.CORPORATE : body.accountType === '对私' ? AccountType.PERSONAL : AccountType.PLATFORM,
      accountCategory: body.accountCategory === 'PRIMARY' ? AccountCategory.PRIMARY : AccountCategory.VIRTUAL,
      accountPurpose: body.accountPurpose,
      currency: body.currency || 'RMB',
      country: body.country || 'CN',
      originalBalance: Number(body.originalBalance) || 0,
      initialCapital: body.initialCapital !== undefined ? Number(body.initialCapital) : undefined,
      exchangeRate: Number(body.exchangeRate) || 1,
      rmbBalance: Number(body.rmbBalance) || 0,
      companyEntity: body.companyEntity || null,
      owner: body.owner || null,
      notes: body.notes || '',
      platformAccount: body.platformAccount || null,
      platformPassword: body.platformPassword || null,
      platformUrl: body.platformUrl || null,
      updatedAt: new Date()
    }

    // 处理 parentId 关系
    if (body.parentId) {
      updateData.parent = {
        connect: { id: body.parentId }
      }
    } else {
      // 清除关系时使用 disconnect
      updateData.parent = {
        disconnect: true
      }
    }

    // 处理 storeId 关系
    if (body.storeId) {
      updateData.store = {
        connect: { id: body.storeId }
      }
    } else {
      // 清除关系时使用 disconnect
      updateData.store = {
        disconnect: true
      }
    }

    const updated = await prisma.bankAccount.update({
      where: { id },
      data: updateData
    })
    
    // 转换返回格式
    const transformed = {
      id: updated.id,
      name: updated.name,
      accountNumber: updated.accountNumber,
      accountType: updated.accountType === 'CORPORATE' ? '对公' as const : updated.accountType === 'PERSONAL' ? '对私' as const : '平台' as const,
      accountCategory: updated.accountCategory === 'PRIMARY' ? 'PRIMARY' as const : 'VIRTUAL' as const,
      accountPurpose: updated.accountPurpose,
      currency: updated.currency as 'RMB' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'HKD' | 'SGD' | 'AUD',
      country: updated.country,
      originalBalance: Number(updated.originalBalance),
      initialCapital: updated.initialCapital ? Number(updated.initialCapital) : undefined,
      exchangeRate: Number(updated.exchangeRate),
      rmbBalance: Number(updated.rmbBalance),
      parentId: updated.parentId || undefined,
      storeId: updated.storeId || undefined,
      companyEntity: updated.companyEntity || undefined,
      owner: updated.owner || undefined,
      notes: updated.notes,
      platformAccount: updated.platformAccount || undefined,
      platformPassword: updated.platformPassword || undefined,
      platformUrl: updated.platformUrl || undefined,
      createdAt: updated.createdAt.toISOString()
    }
    
    return NextResponse.json(transformed)
  } catch (error: any) {
    // 返回更详细的错误信息
    const errorMessage = error?.message || `Failed to update account ${params.id}`
    const errorCode = error?.code || 'UNKNOWN_ERROR'
    
    return NextResponse.json(
      { 
        error: errorMessage,
        code: errorCode,
        details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}

// DELETE - 删除账户
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 🔐 权限检查
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 })
    }
    const userRole = session.user?.role
    const canDelete = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN' || userRole === 'MANAGER'
    if (!canDelete) {
      return NextResponse.json({ error: '没有权限' }, { status: 403 })
    }

    const { id } = params

    await prisma.bankAccount.delete({
      where: { id }
    })
    
    return NextResponse.json({ message: 'Account deleted successfully' })
  } catch (error) {
    return handlePrismaError(error, { notFoundMessage: '未找到账户', serverMessage: `Failed to delete account ${params.id}` })
  }
}
