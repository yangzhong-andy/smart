import { NextRequest, NextResponse } from 'next/server';
import { getFinanceRates } from '@/lib/exchange';

/**
 * GET - 获取财务中心专用汇率数据
 * 返回 USD, JPY, THB 对 CNY 的汇率
 * 使用 Next.js revalidate 机制，每 1 小时自动更新
 */
export async function GET(request: NextRequest) {
  try {
    const rates = await getFinanceRates();
    
    if (!rates) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch finance rates. Please check EXCHANGERATE_API_KEY in environment variables.' 
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: rates,
      lastUpdated: rates.lastUpdated
    });
  } catch (error: any) {
    console.error('Error in finance rates API:', error);
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
