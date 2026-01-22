import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// 数据库连接重试辅助函数
export async function connectWithRetry(retries = 3, delay = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect()
      return // 连接成功
    } catch (error: any) {
      const isLastAttempt = i === retries - 1
      const isConnectionError = 
        error.message?.includes('TLS connection') || 
        error.message?.includes('connection') ||
        error.message?.includes('ECONNREFUSED') ||
        error.code === 'P1001'
      
      if (isLastAttempt) {
        throw error
      }
      
      if (isConnectionError) {
        console.log(`数据库连接失败，${i + 1}/${retries} 次重试...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      
      // 非连接错误直接抛出
      throw error
    }
  }
}