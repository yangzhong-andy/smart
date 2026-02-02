"use client";

import { useExchangeRate } from '@/hooks/useExchangeRate';
import { formatRate } from '@/lib/exchange';
import { useEffect, useState, useRef } from 'react';

/**
 * 汇率显示栏组件
 * 显示主要货币对人民币的实时汇率
 * 走马灯动效 + 呼吸灯状态指示
 */
export default function ExchangeRateBar() {
  const { getRate, timestamp, isLoading, error } = useExchangeRate();
  const [isAnimating, setIsAnimating] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 要显示的货币对（USD、GBP、THB、MYR）
  const currencies = ['USD', 'GBP', 'THB', 'MYR'];
  
  // 构建汇率文本内容
  const rateTexts = currencies.map(currency => {
    const rate = getRate(currency);
    return `${currency} ${rate > 0 ? formatRate(rate) : '--'} CNY`;
  }).join('  •  ');

  // 走马灯滚动效果
  useEffect(() => {
    if (!containerRef.current || !contentRef.current || !isAnimating) return;

    const container = containerRef.current;
    const content = contentRef.current;
    
    // 如果内容宽度小于容器，不需要滚动
    if (content.scrollWidth <= container.clientWidth) {
      setIsAnimating(false);
      return;
    }

    let position = 0;
    const speed = 0.5; // 滚动速度（px/帧）

    const animate = () => {
      position -= speed;
      
      // 当内容完全滚出左侧时，重置到右侧
      if (Math.abs(position) >= content.scrollWidth) {
        position = container.clientWidth;
      }
      
      content.style.transform = `translateX(${position}px)`;
      requestAnimationFrame(animate);
    };

    const animationId = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [rateTexts, isAnimating]);

  // 格式化最后更新时间
  const formatLastUpdated = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 判断同步状态
  const syncStatus = error ? 'error' : (timestamp ? 'success' : 'loading');

  return (
    <div className="w-full px-3 py-2 bg-white/[0.02] backdrop-blur-xl border-y border-white/10 relative overflow-hidden">
      <div className="flex items-center gap-3">
        {/* 呼吸灯状态指示器 */}
        <div className="flex-shrink-0 relative">
          <div 
            className={`w-1.5 h-1.5 rounded-full transition-all duration-1000 ${
              syncStatus === 'success' 
                ? 'bg-cyan-400 animate-pulse' 
                : syncStatus === 'error'
                ? 'bg-rose-600 animate-pulse'
                : 'bg-slate-500 animate-pulse'
            }`}
            style={{
              boxShadow: syncStatus === 'success' 
                ? '0 0 4px rgba(34, 211, 238, 0.6)' 
                : syncStatus === 'error'
                ? '0 0 4px rgba(225, 29, 72, 0.4)'
                : '0 0 2px rgba(148, 163, 184, 0.3)'
            }}
          />
        </div>

        {/* 走马灯汇率显示 */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-hidden"
          style={{ height: '20px' }}
        >
          <div
            ref={contentRef}
            className="whitespace-nowrap text-xs font-extralight text-cyan-400 transition-transform duration-0"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {isLoading && !timestamp ? (
              <span className="text-slate-400">加载汇率中...</span>
            ) : error ? (
              <span 
                className="text-rose-400 cursor-help" 
                title="请配置 EXCHANGERATE_API_KEY：.env.local 或部署平台环境变量，详见 docs/汇率接口配置.md"
              >
                汇率同步失败（未配置 API Key）
              </span>
            ) : (
              <>
                {rateTexts}
                {/* 重复内容以实现无缝循环 */}
                {isAnimating && (
                  <span className="ml-8">
                    {rateTexts}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
