import { PrismaClient } from '@prisma/client'
import path from 'path'

/**
 * 创建 PrismaClient 实例（工厂函数）
 * 集中配置日志等选项
 * 关键：显式指定引擎文件路径，解决 Next.js build 后找不到引擎的问题
 */
function createPrismaClient(): PrismaClient {
  // 显式指定引擎文件路径，避免 Next.js 打包后路径丢失
  const enginePath = path.join(process.cwd(), 'node_modules', '.prisma', 'client')
  
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : process.env.ENABLE_QUERY_LOG === 'true'
          ? ['query', 'error']
          : ['error'],
    ...(process.env.NODE_ENV === 'production' ? {
      // 生产环境显式指定引擎目录
      __internal: { engine: { binaryPaths: { queryEngine: enginePath } } } as any,
    } : {}),
  })
}

/**
 * 单例模式：将 prisma 挂载到 globalThis，防止开发环境 HMR 时重复创建连接
 * 参考：https://www.prisma.io/docs/orm/more/help-and-troubleshooting/help-articles/nextjs-prisma-client-dev-practices
 */
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma = globalThis.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
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