// 认证相关工具函数

const AUTH_TOKEN_KEY = "auth_token";
const USER_INFO_KEY = "user_info";

export interface UserInfo {
  email: string;
  name: string;
  loginTime: string;
}

/**
 * 检查用户是否已登录
 */
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  return !!token;
}

/**
 * 获取当前用户信息
 */
export function getCurrentUser(): UserInfo | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  const userInfoStr = window.localStorage.getItem(USER_INFO_KEY);
  if (!userInfoStr) {
    return null;
  }
  
  try {
    return JSON.parse(userInfoStr) as UserInfo;
  } catch {
    return null;
  }
}

/**
 * 获取认证令牌
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * 登出
 */
export function logout(): void {
  if (typeof window === "undefined") {
    return;
  }
  
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(USER_INFO_KEY);
}
