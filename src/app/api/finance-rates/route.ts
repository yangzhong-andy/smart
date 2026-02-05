import { NextRequest, NextResponse } from 'next/server';
import { getFinanceRates } from '@/lib/exchange';

export const dynamic = 'force-dynamic';

/**
 * GET - 获取财务中心专用汇率数据
 * 返回 USD, JPY, THB 对 CNY 的汇率
 * 使用 Next.js revalidate 机制，每 1 小时自动更新
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('📡 [Finance Rates API] 收到请求');
  
  try {
    // 检查环境变量
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    
    console.log(`🔑 [Finance Rates API] API Key 检查: ${apiKey ? '已配置' : '未配置'}`);
    
    if (!apiKey) {
      console.error('❌ [Finance Rates API] EXCHANGERATE_API_KEY 环境变量未配置');
      return NextResponse.json(
        { 
          success: false, 
          error: 'EXCHANGERATE_API_KEY environment variable is not set. Please configure it in your deployment platform (Vercel/Netlify/etc).',
          errorCode: 'MISSING_API_KEY',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
    
    console.log('🔄 [Finance Rates API] 开始调用 getFinanceRates()');
    const rates = await getFinanceRates();
    
    if (!rates) {
      console.error('❌ [Finance Rates API] getFinanceRates() 返回 null');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to fetch finance rates. Please check EXCHANGERATE_API_KEY in environment variables.',
          errorCode: 'FETCH_FAILED',
          timestamp: new Date().toISOString()
        },
        { status: 500 }
      );
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ [Finance Rates API] 成功返回数据，耗时: ${duration}ms`);
    console.log(`   USD: ${rates.USD}, JPY: ${rates.JPY}, THB: ${rates.THB}`);
    
    return NextResponse.json({
      success: true,
      data: rates,
      lastUpdated: rates.lastUpdated,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [Finance Rates API] 错误 (耗时: ${duration}ms):`, error);
    console.error('   错误堆栈:', error.stack);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Internal server error',
        errorCode: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// 设置重新验证时间为 1 小时（3600 秒）
export const revalidate = 3600;
