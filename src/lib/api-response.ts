import { NextResponse } from 'next/server'

/**
 * API 统一错误响应
 * 在 route handler 的 catch 或校验失败时使用
 */

/** 400 请求参数错误 */
export function badRequest(message: string = '请求参数错误') {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** 404 资源不存在 */
export function notFound(message: string = '未找到') {
  return NextResponse.json({ error: message }, { status: 404 })
}

/** 500 服务器错误 */
export function serverError(
  message: string,
  error?: unknown,
  options?: { includeDetailsInDev?: boolean }
) {
  const body: { error: string; details?: string } = { error: message }
  if (options?.includeDetailsInDev && process.env.NODE_ENV === 'development' && error instanceof Error) {
    body.details = error.message
  }
  return NextResponse.json(body, { status: 500 })
}

/** Prisma 错误：P2025 转为 404，其余转为 500 */
export function handlePrismaError(
  error: unknown,
  options: { notFoundMessage: string; serverMessage: string }
): NextResponse {
  if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
    return notFound(options.notFoundMessage)
  }
  return serverError(options.serverMessage)
}
