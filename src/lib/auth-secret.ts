/**
 * 统一认证密钥来源，确保 NextAuth 签发与 middleware 校验使用同一 secret。
 */
export const AUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  process.env.JWT_SECRET ||
  "insecure-default-do-not-use-in-production";

