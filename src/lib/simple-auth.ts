/**
 * 简化的认证系统
 * 使用 JWT token 和 localStorage
 */

const AUTH_TOKEN_KEY = "auth_token"
const USER_INFO_KEY = "user_info"

export interface UserInfo {
  id: string
  email: string
  name: string
  role: string | null
  departmentId: string | null
  departmentName: string | null
  departmentCode: string | null
}

/**
 * 检查用户是否已登录
 */
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)
  return !!token
}

/**
 * 获取当前用户信息
 */
export function getCurrentUser(): UserInfo | null {
  if (typeof window === "undefined") {
    return null
  }
  
  const userInfoStr = window.localStorage.getItem(USER_INFO_KEY)
  if (!userInfoStr) {
    return null
  }
  
  try {
    return JSON.parse(userInfoStr) as UserInfo
  } catch (e) {
    console.error("Failed to parse user info", e)
    return null
  }
}

/**
 * 获取认证 token
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null
  }
  
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

/**
 * 保存用户信息和 token
 */
export function saveAuth(token: string, user: UserInfo): void {
  if (typeof window === "undefined") {
    return
  }
  
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(user))
}

/**
 * 清除认证信息
 */
export function clearAuth(): void {
  if (typeof window === "undefined") {
    return
  }
  
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(USER_INFO_KEY)
}

/**
 * 登录
 */
export async function login(email: string, password: string): Promise<{ success: boolean; error?: string; user?: UserInfo }> {
  try {
    const response = await fetch('/api/auth/simple-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error || '登录失败'
      }
    }

    if (data.success && data.token && data.user) {
      // 保存 token 和用户信息
      saveAuth(data.token, data.user)
      
      return {
        success: true,
        user: data.user
      }
    }

    return {
      success: false,
      error: '登录响应格式错误'
    }
  } catch (error: any) {
    console.error('Login error:', error)
    return {
      success: false,
      error: error.message || '网络错误，请稍后重试'
    }
  }
}

/**
 * 登出
 */
export function logout(): void {
  clearAuth()
  if (typeof window !== "undefined") {
    window.location.href = "/login"
  }
}
