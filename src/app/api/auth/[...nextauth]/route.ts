import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import * as bcrypt from 'bcryptjs'

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
      // 将 token 中的信息添加到 session
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string | null
        session.user.departmentId = token.departmentId as string | null
        session.user.departmentName = token.departmentName as string | null
        session.user.departmentCode = token.departmentCode as string | null
      }
      return session
    }
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60 // 7 天
  },
  secret: process.env.NEXTAUTH_SECRET || 'your-secret-key-change-in-production'
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
