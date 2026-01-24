import { NextRequest, NextResponse } from 'next/server';
import { getFinanceRates } from '@/lib/exchange';

/**
 * GET - 获取财务中心专用汇率数据
 * 返回 USD, JPY, THB 对 CNY 的汇率
 * 使用 Next.js revalidate 机制，每 1 小时自动更新
 */
export async function GET(request: NextRequest) {
  try {
    // 检查环境变量
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    
    if (!apiKey) {
      console.error('❌ EXCHANGERATE_API_KEY 环境变量未配置');
      return NextResponse.json(
        { 
          success: false, 
          error: 'EXCHANGERATE_API_KEY environment variable is not set. Please configure it in your deployment platform (Vercel/Netlify/etc).',
          errorCode: 'MISSING_API_KEY'
        },
        { status: 500 }
      );
    }
    
    const rates = await getFinanceRates();
    
    if (!rates) {
      console.error('❌ 获取汇率数据失败');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch finance rates. Please check EXCHANGERATE_API_KEY in environment variables.',
          errorCode: 'FETCH_FAILED'
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
    console.error('❌ Error in finance rates API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Internal server error',
        errorCode: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

// 设置重新验证时间为 1 小时（3600 秒）
export const revalidate = 3600;
