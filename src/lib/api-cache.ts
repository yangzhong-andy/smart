/**
 * API 响应缓存工具
 * 用于减少数据库查询，提高高并发性能
 */

// 简单的内存缓存（生产环境可以使用 Redis）
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

export function getCachedResponse(key: string): any | null {
  const cached = cache.get(key);
  if (!cached) return null;
  
  // 检查是否过期
  if (Date.now() - cached.timestamp > cached.ttl) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

export function setCachedResponse(key: string, data: any, ttl: number = 30000): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

// 定期清理过期缓存
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > value.ttl) {
        cache.delete(key);
      }
    }
  }, 60000); // 每分钟清理一次
}
