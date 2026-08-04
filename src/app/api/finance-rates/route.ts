import { NextRequest, NextResponse } from 'next/server';
import { getFinanceRates } from '@/lib/exchange';
import { getCache, setCache, generateCacheKey } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 1800; // 30分钟
const CACHE_KEY_PREFIX = 'finance-rates';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(CACHE_KEY_PREFIX, 'latest');

    // 检查环境变量
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'EXCHANGERATE_API_KEY 未配置',
        },
        { status: 500 }
      );
    }

    // 尝试从缓存获取
    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        cached.cached = true;
        return NextResponse.json(cached);
      }
    }

    // 获取最新汇率
    const rates = await getFinanceRates();
    if (!rates) {
      return NextResponse.json(
        { success: false, error: '获取汇率数据失败' },
        { status: 500 }
      );
    }

    const response = {
      success: true,
      data: rates,
      lastUpdated: rates.lastUpdated,
      timestamp: new Date().toISOString(),
      cached: false
    };

    // 设置缓存
    await setCache(cacheKey, response, CACHE_TTL);

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// 设置重新验证时间为 1 小时（作为缓存降级）
export const revalidate = 3600;
