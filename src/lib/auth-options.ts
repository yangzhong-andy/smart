import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'
import { AUTH_SECRET } from '@/lib/auth-secret'

// 检查 NEXTAUTH_SECRET 是否配置
if (!process.env.NEXTAUTH_SECRET) {
  console.error('⚠️ 警告：NEXTAUTH_SECRET 未配置，使用不安全的默认密钥！请尽快在环境变量中设置 NEXTAUTH_SECRET');
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('邮箱和密码不能为空')
        }

        try {
          // 查找用户
          const user = await prisma.user.findUnique({
            where: { email: credentials.email.trim().toLowerCase() },
            include: {
              department: true
            }
          })

          if (!user) {
            throw new Error('邮箱或密码错误')
          }

          // 检查用户是否启用
          if (!user.isActive) {
            throw new Error('账号已被禁用，请联系管理员')
          }

          // 验证密码
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          )

          if (!isPasswordValid) {
            throw new Error('邮箱或密码错误')
          }

          // 更新最后登录时间
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() }
          })

          // 返回用户信息
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            departmentId: user.departmentId,
            departmentName: user.department?.name || null,
            departmentCode: user.department?.code || null
          }
        } catch (error: any) {
          console.error('Login error:', error)
          throw new Error(error.message || '登录失败，请稍后重试')
        }
      }
    })
  ],
  pages: {
    signIn: '/login',
    error: '/api/auth/error'
  },
  callbacks: {
    async jwt({ token, user }) {
      // 首次登录时，将用户信息添加到 token
      if (user) {
        token.id = user.id
        token.role = user.role
        token.departmentId = user.departmentId
        token.departmentName = user.departmentName
        token.departmentCode = user.departmentCode
      }
      return token
    },
    async session({ session, token }) {
      if (!session.user || !token.id) return session

      // 每次读 session 时从库刷新角色/部门，避免改权限后 JWT 仍是旧值
      try {
        const user = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: { department: true },
        })
        if (user?.isActive) {
          session.user.id = user.id
          session.user.role = user.role
          session.user.departmentId = user.departmentId
          session.user.departmentName = user.department?.name ?? null
          session.user.departmentCode = user.department?.code ?? null
          return session
        }
      } catch (e) {
        console.warn("[auth] session 刷新用户信息失败，使用 JWT 缓存", e)
      }

      session.user.id = token.id as string
      session.user.role = (token.role as string | null) ?? null
      session.user.departmentId = (token.departmentId as string | null) ?? null
      session.user.departmentName = (token.departmentName as string | null) ?? null
      session.user.departmentCode = (token.departmentCode as string | null) ?? null
      return session
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60 // 7 天
  },
  secret: AUTH_SECRET
}
