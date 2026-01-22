"use client";

import { useMemo } from "react";

type InventoryDistributionProps = {
  atFactory?: number; // 工厂现货
  atDomestic?: number; // 国内待发
  inTransit?: number; // 海运中
  unitPrice?: number; // 单价（用于计算总价值）
  size?: "sm" | "md" | "lg"; // 尺寸
  showValue?: boolean; // 是否显示总价值
};

export default function InventoryDistribution({
  atFactory = 0,
  atDomestic = 0,
  inTransit = 0,
  unitPrice,
  size = "md",
  showValue = false
}: InventoryDistributionProps) {
  const total = atFactory + atDomestic + inTransit;
  
  const distribution = useMemo(() => {
    if (total === 0) {
      return {
        factoryPercent: 0,
        domesticPercent: 0,
        transitPercent: 0,
        factoryHeight: 0,
        domesticHeight: 0,
        transitHeight: 0
      };
    }
    
    const factoryPercent = (atFactory / total) * 100;
    const domesticPercent = (atDomestic / total) * 100;
    const transitPercent = (inTransit / total) * 100;
    
    // 蓄水池总高度（根据尺寸调整）
    const poolHeight = size === "sm" ? 60 : size === "md" ? 80 : 100;
    
    return {
      factoryPercent,
      domesticPercent,
      transitPercent,
      factoryHeight: (atFactory / total) * poolHeight,
      domesticHeight: (atDomestic / total) * poolHeight,
      transitHeight: (inTransit / total) * poolHeight
    };
  }, [atFactory, atDomestic, inTransit, total, size]);
  
  const totalValue = unitPrice ? total * unitPrice : 0;
  
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-20 h-20",
    lg: "w-24 h-24"
  };
  
  const textSizeClasses = {
    sm: "text-[8px]",
    md: "text-[10px]",
    lg: "text-xs"
  };
  
  if (total === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className={`${sizeClasses[size]} rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center`}>
          <span className={`${textSizeClasses[size]} text-slate-500`}>空</span>
        </div>
        {showValue && unitPrice && (
          <div className="text-xs text-slate-400">
            ¥0.00
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2">
      {/* 蓄水池容器 */}
      <div className={`${sizeClasses[size]} relative rounded-lg border-2 border-slate-700 overflow-hidden bg-slate-900/50`}>
        {/* 工厂现货层（最底层，蓝色） */}
        {atFactory > 0 && (
          <div
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-blue-600 to-blue-500 transition-all duration-300"
            style={{
              height: `${distribution.factoryHeight}px`,
              zIndex: 1
            }}
            title={`工厂现货: ${atFactory}`}
          />
        )}
        
        {/* 国内待发层（中间层，绿色） */}
        {atDomestic > 0 && (
          <div
            className="absolute left-0 right-0 bg-gradient-to-t from-emerald-600 to-emerald-500 transition-all duration-300"
            style={{
              height: `${distribution.domesticHeight}px`,
              bottom: `${distribution.factoryHeight}px`,
              zIndex: 2
            }}
            title={`国内待发: ${atDomestic}`}
          />
        )}
        
        {/* 海运中层（最上层，橙色） */}
        {inTransit > 0 && (
          <div
            className="absolute left-0 right-0 bg-gradient-to-t from-amber-600 to-amber-500 transition-all duration-300"
            style={{
              height: `${distribution.transitHeight}px`,
              bottom: `${distribution.factoryHeight + distribution.domesticHeight}px`,
              zIndex: 3
            }}
            title={`海运中: ${inTransit}`}
          />
        )}
        
        {/* 数值标签（如果空间足够） */}
        {size !== "sm" && total > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className={`${textSizeClasses[size]} font-bold text-white drop-shadow-lg`}>
              {total}
            </span>
          </div>
        )}
      </div>
      
      {/* 图例和数值 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className={`${textSizeClasses[size]} text-slate-300`}>
            工厂: {atFactory}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className={`${textSizeClasses[size]} text-slate-300`}>
            国内: {atDomestic}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
          <span className={`${textSizeClasses[size]} text-slate-300`}>
            海运: {inTransit}
          </span>
        </div>
        {showValue && unitPrice && totalValue > 0 && (
          <div className={`${textSizeClasses[size]} text-slate-400 mt-1 pt-1 border-t border-slate-700`}>
            总值: ¥{totalValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        )}
      </div>
    </div>
  );
}
