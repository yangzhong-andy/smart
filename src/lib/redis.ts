import Redis from 'ioredis';

// Redis 客户端单例
let redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false, // 立即连接，避免首次请求时缓存静默失效
    });
    
    redis.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
    
    redis.on('connect', () => {
      console.log('✅ Redis connected');
    });
  }
  
  return redis;
}

// 缓存键前缀（用 APP_NAME 区分不同业务系统，避免共用 Redis 时缓存冲突）
const CACHE_PREFIX = `smart:erp:${process.env.APP_NAME || 'default'}:`;

// 是否打印缓存日志（开发环境可开启）
const CACHE_LOG = process.env.CACHE_LOG === 'true';

// 生成缓存键
export function generateCacheKey(prefix: string, ...args: string[]): string {
  return `${CACHE_PREFIX}${prefix}:${args.join(':')}`;
}

// 获取缓存
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    if (!client) return null;
    
    const data = await client.get(key);
    if (data) {
      if (CACHE_LOG) console.log(`✅ Cache HIT: ${key}`);
      return JSON.parse(data) as T;
    }
    if (CACHE_LOG) console.log(`❌ Cache MISS: ${key}`);
    return null;
  } catch (error) {
    console.error('Redis get error:', error);
    return null;
  }
}

// 设置缓存
export async function setCache(key: string, value: any, ttlSeconds: number = 300): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) return false;
    
    await client.setex(key, ttlSeconds, JSON.stringify(value));
    if (CACHE_LOG) console.log(`✅ Cache SET: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error('Redis set error:', error);
    return false;
  }
}

// 删除缓存
export async function deleteCache(key: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) return false;
    
    await client.del(key);
    if (CACHE_LOG) console.log(`✅ Cache DEL: ${key}`);
    return true;
  } catch (error) {
    console.error('Redis del error:', error);
    return false;
  }
}

// 清除指定前缀的所有缓存（使用 SCAN 代替 KEYS，避免阻塞 Redis）
export async function clearCacheByPrefix(prefix: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) return false;
    
    const pattern = `${CACHE_PREFIX}${prefix}:*`;
    let cursor = '0';
    let totalDeleted = 0;
    
    do {
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      
      if (keys.length > 0) {
        await client.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== '0');
    
    if (totalDeleted > 0) {
      console.log(`✅ Cache CLEARED: ${totalDeleted} keys matching ${pattern}`);
    }
    
    return true;
  } catch (error) {
    console.error('Redis clear error:', error);
    return false;
  }
}

// 关闭 Redis 连接
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log('🔌 Redis disconnected');
  }
}

// 缓存装饰器工厂
export function withCache<T>(
  cacheKey: string,
  ttlSeconds: number = 300,
  condition?: (args: any) => boolean
) {
  return async (fn: () => Promise<T>): Promise<T> => {
    // 尝试从缓存获取
    const cached = await getCache<T>(cacheKey);
    if (cached) return cached;
    
    // 执行原始函数
    const result = await fn();
    
    // 设置缓存
    await setCache(cacheKey, result, ttlSeconds);
    
    return result;
  };
}
