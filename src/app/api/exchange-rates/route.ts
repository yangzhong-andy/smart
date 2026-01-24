import { NextRequest, NextResponse } from 'next/server';
import { fetchExchangeRates } from '@/lib/exchange';

/**
 * GET - 获取汇率数据
 * 使用 Next.js revalidate 机制，每 1 小时自动更新
 * 以人民币（CNY）为基准，返回 USD、GBP、THB、MYR 的汇率
 */
export async function GET(request: NextRequest) {
  try {
    const rates = await fetchExchangeRates();
    
    if (!rates) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch exchange rates. Please check EXCHANGERATE_API_KEY in environment variables.' 
        },
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
        error: error.message || 'Internal server error' 
      },
      { status: 500 }
    );
  }
}

// 设置重新验证时间为 1 小时（3600 秒）
export const revalidate = 3600;
