/**
 * 统一认证密钥来源，确保 NextAuth 签发与 middleware 校验使用同一 secret。
 * 生产环境必须通过环境变量 NEXTAUTH_SECRET 设置，无回退值以确保安全。
 */
export const AUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('FATAL: NEXTAUTH_SECRET 未配置，生产环境拒绝启动！请在 ecosystem.config.js 中设置 NEXTAUTH_SECRET 环境变量。') })()
    : 'dev-insecure-secret-do-not-use-in-production');

