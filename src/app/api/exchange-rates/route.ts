import { NextRequest, NextResponse } from 'next/server';
import { fetchExchangeRates } from '@/lib/exchange';
import { getCache, setCache, generateCacheKey } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// 缓存配置
const CACHE_TTL = 1800; // 30分钟（汇率变动不频繁）
const CACHE_KEY_PREFIX = 'exchange-rates';

export async function GET(request: NextRequest) {
  const apiKey = process.env.EXCHANGERATE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'EXCHANGERATE_API_KEY 未在部署环境中配置，请在平台环境变量中添加后重新部署。'
      },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const noCache = searchParams.get("noCache") === "true";

    // 生成缓存键
    const cacheKey = generateCacheKey(CACHE_KEY_PREFIX, 'latest');

    // 尝试从缓存获取
    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) {
        cached.cached = true; // 标记为缓存数据
        return NextResponse.json(cached);
      }
    }

    // 获取最新汇率
    const rates = await fetchExchangeRates();
    if (!rates) {
      return NextResponse.json(
        { success: false, error: '获取汇率数据失败，请稍后重试。' },
        { status: 500 }
      );
    }

    const response = {
      success: true,
      data: rates,
      lastUpdated: new Date(rates.timestamp).toISOString(),
      cached: false
    };

    // 设置缓存
    await setCache(cacheKey, response, CACHE_TTL);

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || '汇率服务暂时不可用，请检查部署环境是否允许访问 exchangerate-api.com。'
      },
      { status: 500 }
    );
  }
}

// 设置重新验证时间为 1 小时（作为缓存降级）
export const revalidate = 3600;
