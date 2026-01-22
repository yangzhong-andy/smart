import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { AccountType, AccountCategory } from '@prisma/client'

// GET - 获取所有账户
export async function GET() {
  try {
    // 确保数据库连接
    await prisma.$connect().catch(() => {
      // 连接失败时继续尝试查询，Prisma 会自动重连
    })

    const accounts = await prisma.bankAccount.findMany({
      include: {
        parent: true,
        store: true,
        _count: {
          select: { children: true, cashFlows: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    
    // 转换格式以匹配前端 BankAccount 类型
    const transformed = accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      accountNumber: acc.accountNumber,
      accountType: acc.accountType === 'CORPORATE' ? '对公' as const : acc.accountType === 'PERSONAL' ? '对私' as const : '平台' as const,
      accountCategory: acc.accountCategory === 'PRIMARY' ? 'PRIMARY' as const : 'VIRTUAL' as const,
      accountPurpose: acc.accountPurpose,
      currency: acc.currency as 'RMB' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'HKD' | 'SGD' | 'AUD',
      country: acc.country,
      originalBalance: Number(acc.originalBalance),
      initialCapital: acc.initialCapital ? Number(acc.initialCapital) : undefined,
      exchangeRate: Number(acc.exchangeRate),
      rmbBalance: Number(acc.rmbBalance),
      parentId: acc.parentId || undefined,
      storeId: acc.storeId || undefined,
      companyEntity: acc.companyEntity || undefined,
      notes: acc.notes,
      platformAccount: acc.platformAccount || undefined,
      platformPassword: acc.platformPassword || undefined,
      platformUrl: acc.platformUrl || undefined,
      createdAt: acc.createdAt.toISOString()
    }))
    
    return NextResponse.json(transformed)
  } catch (error: any) {
    console.error('Error fetching accounts:', error)
    
    // 检查是否是数据库连接错误
    if (error.message?.includes('TLS connection') || 
        error.message?.includes('connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001' ||
        !process.env.DATABASE_URL) {
      return NextResponse.json(
        { 
          error: '数据库连接失败',
          details: process.env.NODE_ENV === 'production' 
            ? '请检查 Vercel 环境变量中的 DATABASE_URL 配置'
            : '请检查 .env.local 中的 DATABASE_URL 配置'
        },
        { status: 503 }
      )
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch accounts', details: error.message },
      { status: 500 }
    )
  }
}

// POST - 创建新账户
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const account = await prisma.bankAccount.create({
      data: {
        name: body.name,
        accountNumber: body.accountNumber,
        accountType: body.accountType === '对公' ? AccountType.CORPORATE : body.accountType === '对私' ? AccountType.PERSONAL : AccountType.PLATFORM,
        accountCategory: body.accountCategory === 'PRIMARY' ? AccountCategory.PRIMARY : AccountCategory.VIRTUAL,
        accountPurpose: body.accountPurpose,
        currency: body.currency || 'RMB',
        country: body.country || 'CN',
        originalBalance: Number(body.originalBalance) || 0,
        initialCapital: body.initialCapital !== undefined ? Number(body.initialCapital) : (Number(body.originalBalance) || 0),
        exchangeRate: Number(body.exchangeRate) || 1,
        rmbBalance: Number(body.rmbBalance) || 0,
        parentId: body.parentId || null,
        storeId: body.storeId || null,
        companyEntity: body.companyEntity || null,
        notes: body.notes || '',
        platformAccount: body.platformAccount || null,
        platformPassword: body.platformPassword || null,
        platformUrl: body.platformUrl || null,
      }
    })
    
    // 转换返回格式
    const transformed = {
      id: account.id,
      name: account.name,
      accountNumber: account.accountNumber,
      accountType: account.accountType === 'CORPORATE' ? '对公' as const : account.accountType === 'PERSONAL' ? '对私' as const : '平台' as const,
      accountCategory: account.accountCategory === 'PRIMARY' ? 'PRIMARY' as const : 'VIRTUAL' as const,
      accountPurpose: account.accountPurpose,
      currency: account.currency as 'RMB' | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'HKD' | 'SGD' | 'AUD',
      country: account.country,
      originalBalance: Number(account.originalBalance),
      initialCapital: account.initialCapital ? Number(account.initialCapital) : undefined,
      exchangeRate: Number(account.exchangeRate),
      rmbBalance: Number(account.rmbBalance),
      parentId: account.parentId || undefined,
      storeId: account.storeId || undefined,
      companyEntity: account.companyEntity || undefined,
      notes: account.notes,
      platformAccount: account.platformAccount || undefined,
      platformPassword: account.platformPassword || undefined,
      platformUrl: account.platformUrl || undefined,
      createdAt: account.createdAt.toISOString()
    }
    
    return NextResponse.json(transformed, { status: 201 })
  } catch (error: any) {
    console.error('Error creating account:', error)
    // 返回更详细的错误信息
    const errorMessage = error?.message || 'Failed to create account'
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
