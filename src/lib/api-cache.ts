/**
 * API 响应缓存工具
 * 用于减少数据库查询，提高高并发性能
 * 
 * 缓存策略：读取时短期缓存（3秒），写入时立即清除，确保前端数据实时性
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

export function setCachedResponse(key: string, data: any, ttl: number = 3000): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

/**
 * 清除指定缓存或全部缓存
 * 在写入/更新/删除操作后调用，确保下次读取拿到最新数据
 */
export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * 按前缀清除缓存
 * 用于关联表的缓存清除，比如更新账户时清除所有账户相关缓存
 */
export function clearCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
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
  }, 10000); // 每10秒清理一次（从60秒缩短）
}
