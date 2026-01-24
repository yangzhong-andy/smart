import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string | null
      departmentId: string | null
      departmentName: string | null
      departmentCode: string | null
    }
  }

  interface User {
    id: string
    email: string
    name: string
    role: string | null
    departmentId: string | null
    departmentName: string | null
    departmentCode: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: string | null
    departmentId: string | null
    departmentName: string | null
    departmentCode: string | null
  }
}
