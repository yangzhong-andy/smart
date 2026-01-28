import useSWR from 'swr';
import { ExchangeRates, getRateToCNY } from '@/lib/exchange';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Failed to fetch exchange rates');
  }
  const data = await res.json();
  return data.success ? data.data : null;
};

/**
 * 汇率数据 Hook
 * 提供实时汇率数据，自动缓存和更新
 * 以人民币（CNY）为基准，支持 USD、GBP、THB、MYR
 */
export function useExchangeRate() {
  const { data, error, isLoading, mutate } = useSWR<ExchangeRates>(
    '/api/exchange-rates',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false, // 优化：关闭重连自动刷新
      refreshInterval: 0, // 优化：禁用自动刷新，改为手动刷新
      dedupingInterval: 600000, // 优化：增加到10分钟内去重
    }
  );

  /**
   * 获取指定货币对 CNY 的汇率
   * @param currency 货币代码（USD, GBP, THB, MYR）
   * @returns 1 单位目标货币 = X CNY
   */
  const getRate = (currency: string): number => {
    if (!data || !data.rates) {
      return 0;
    }
    return getRateToCNY(currency, data.rates);
  };

  /**
   * 获取多个货币的汇率
   */
  const getRates = (currencies: string[]): Record<string, number> => {
    const result: Record<string, number> = {};
    currencies.forEach(currency => {
      result[currency] = getRate(currency);
    });
    return result;
  };

  /**
   * 转换金额到人民币
   * @param amount 原币金额
   * @param fromCurrency 原币种（USD, GBP, THB, MYR）
   * @returns 人民币金额
   */
  const convertToCNY = (amount: number, fromCurrency: string): number => {
    if (fromCurrency === 'CNY' || fromCurrency === 'RMB') {
      return amount;
    }
    const rate = getRate(fromCurrency);
    return amount * rate;
  };

  return {
    rates: data?.rates || {},
    base: data?.base || 'CNY',
    date: data?.date || '',
    timestamp: data?.timestamp || 0,
    isLoading,
    error,
    getRate,
    getRates,
    convertToCNY,
    refresh: mutate
  };
}
