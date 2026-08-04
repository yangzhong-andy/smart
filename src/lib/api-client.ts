/**
 * API 客户端工具
 * 自动在请求中添加 JWT token
 */

import { getAuthToken } from './auth';

/**
 * 创建带认证的 fetch 请求
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();
  
  const headers = new Headers(options.headers);
  
  // 添加 Authorization header
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // 确保 Content-Type 已设置（如果是 JSON 请求）
  if (options.body && typeof options.body === 'object' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  
  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * GET 请求
 */
export async function apiGet<T = any>(url: string): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'GET',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

/**
 * POST 请求
 */
export async function apiPost<T = any>(url: string, data: any): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

/**
 * PUT 请求
 */
export async function apiPut<T = any>(url: string, data: any): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    
    // 如果是 403 权限错误，返回更详细的错误信息
    if (response.status === 403) {
      throw new Error(error.message || '权限不足');
    }
    
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

/**
 * DELETE 请求
 */
export async function apiDelete<T = any>(url: string): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}
