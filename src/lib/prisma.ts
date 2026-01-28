import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 🔍 排查模式：开启 query 日志以监控数据库访问量
    // 注意：这会输出所有 SQL 查询，生产环境请关闭
    log: process.env.NODE_ENV === 'development' 
      ? ['query', 'error', 'warn'] 
      : process.env.ENABLE_QUERY_LOG === 'true'
      ? ['query', 'error']
      : ['error'],
  })

// 确保开发环境下使用全局单例（防止热更新产生多个实例）
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

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