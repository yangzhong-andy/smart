/**
 * 汇率工具类
 * 提供汇率数据获取和转换功能
 * 使用 exchangerate-api.com v6 API，以人民币为基准
 */

export interface ExchangeRates {
  base: string; // 基础货币（CNY）
  date: string; // 日期
  rates: {
    USD?: number; // 美元
    GBP?: number; // 英镑
    THB?: number; // 泰铢
    MYR?: number; // 马来西亚林吉特
  };
  timestamp: number; // 时间戳
}

export interface ExchangeRateResponse {
  success: boolean;
  data?: ExchangeRates;
  error?: string;
  lastUpdated?: string;
}

/**
 * 从 API 获取汇率数据（以 CNY 为基准）
 * 使用 Next.js fetch 的 revalidate 机制，1小时自动更新一次
 */
export async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const apiKey = process.env.EXCHANGERATE_API_KEY;
    
    if (!apiKey) {
      console.error('EXCHANGERATE_API_KEY is not set in environment variables');
      return null;
    }

    const apiUrl = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/CNY`;
    
    const response = await fetch(apiUrl, {
      next: { revalidate: 3600 } // 1小时缓存，自动更新
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 检查 API 返回状态
    if (data.result !== 'success') {
      throw new Error(`API returned error: ${data['error-type'] || 'Unknown error'}`);
    }

    // 只提取需要的币种：USD、GBP、THB、MYR
    const rates: ExchangeRates['rates'] = {};
    
    if (data.conversion_rates) {
      if (data.conversion_rates.USD) rates.USD = data.conversion_rates.USD;
      if (data.conversion_rates.GBP) rates.GBP = data.conversion_rates.GBP;
      if (data.conversion_rates.THB) rates.THB = data.conversion_rates.THB;
      if (data.conversion_rates.MYR) rates.MYR = data.conversion_rates.MYR;
    }
    
    return {
      base: 'CNY',
      date: data.time_last_update_utc?.split('T')[0] || new Date().toISOString().split('T')[0],
      rates,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return null;
  }
}

/**
 * 获取指定货币对 CNY 的汇率
 * 注意：由于 API 返回的是以 CNY 为基准的汇率（即 1 CNY = X 目标货币）
 * 所以需要取倒数才能得到目标货币对 CNY 的汇率
 * @param currency 货币代码（USD, GBP, THB, MYR）
 * @param rates 汇率数据
 */
export function getRateToCNY(currency: string, rates: ExchangeRates['rates']): number {
  if (currency === 'CNY' || currency === 'RMB') {
    return 1;
  }
  
  // API 返回的是 1 CNY = X 目标货币
  // 我们需要的是 1 目标货币 = X CNY，所以需要取倒数
  const rate = rates[currency as keyof typeof rates];
  
  if (!rate || rate === 0) {
    return 0;
  }
  
  // 返回倒数：1 / rate
  return 1 / rate;
}

/**
 * 格式化汇率显示
 * @param rate 汇率值
 * @param decimals 小数位数，默认为 4
 */
export function formatRate(rate: number, decimals: number = 4): string {
  if (rate === 0 || !Number.isFinite(rate)) {
    return '--';
  }
  return rate.toFixed(decimals);
}

/**
 * 货币代码映射（显示名称）
 */
export const CURRENCY_NAMES: Record<string, string> = {
  USD: '美元',
  CNY: '人民币',
  RMB: '人民币',
  GBP: '英镑',
  THB: '泰铢',
  MYR: '马来西亚林吉特',
  EUR: '欧元',
  JPY: '日元',
  HKD: '港币',
  SGD: '新加坡元',
  AUD: '澳元'
};
