import { NextRequest, NextResponse } from 'next/server';
import { fetchExchangeRates } from '@/lib/exchange';

/**
 * GET - 获取汇率数据
 * 使用 Next.js revalidate 机制，每 1 小时自动更新
 * 以人民币（CNY）为基准，返回 USD、GBP、THB、MYR 的汇率
 */
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
    const rates = await fetchExchangeRates();
    if (!rates) {
      return NextResponse.json(
        { success: false, error: '获取汇率数据失败，请稍后重试。' },
        { status: 500 }
      );
    }
    return NextResponse.json({
      success: true,
      data: rates,
      lastUpdated: new Date(rates.timestamp).toISOString()
    });
  } catch (error: any) {
    console.error('Error in exchange rates API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || '汇率服务暂时不可用，请检查部署环境是否允许访问 exchangerate-api.com。'
      },
      { status: 500 }
    );
  }
}

// 设置重新验证时间为 1 小时（3600 秒）
export const revalidate = 3600;
