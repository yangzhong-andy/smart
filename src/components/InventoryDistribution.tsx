"use client";

import { useMemo } from "react";

type InventoryDistributionProps = {
  atFactory?: number; // 工厂现货
  atDomestic?: number; // 国内待发
  inTransit?: number; // 海运中
  atOverseas?: number; // 海外仓（Stock × 海外仓）
  unitPrice?: number; // 单价（用于计算总价值）
  size?: "sm" | "md" | "lg"; // 尺寸
  showValue?: boolean; // 是否显示总价值
};

export default function InventoryDistribution({
  atFactory = 0,
  atDomestic = 0,
  inTransit = 0,
  atOverseas = 0,
  unitPrice,
  size = "md",
  showValue = false
}: InventoryDistributionProps) {
  const total = atFactory + atDomestic + inTransit + atOverseas;
  
  const distribution = useMemo(() => {
    if (total === 0) {
      return {
        factoryHeight: 0,
        domesticHeight: 0,
        transitHeight: 0,
        overseasHeight: 0
      };
    }

    const poolHeight = size === "sm" ? 60 : size === "md" ? 80 : 100;

    return {
      factoryHeight: (atFactory / total) * poolHeight,
      domesticHeight: (atDomestic / total) * poolHeight,
      transitHeight: (inTransit / total) * poolHeight,
      overseasHeight: (atOverseas / total) * poolHeight
    };
  }, [atFactory, atDomestic, inTransit, atOverseas, total, size]);
  
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
  
  const bF = distribution.factoryHeight;
  const bD = distribution.domesticHeight;
  const bT = distribution.transitHeight;
  
  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClasses[size]} relative rounded-lg border-2 border-slate-700 overflow-hidden bg-slate-900/50`}>
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
        
        {atDomestic > 0 && (
          <div
            className="absolute left-0 right-0 bg-gradient-to-t from-emerald-600 to-emerald-500 transition-all duration-300"
            style={{
              height: `${distribution.domesticHeight}px`,
              bottom: `${bF}px`,
              zIndex: 2
            }}
            title={`国内待发: ${atDomestic}`}
          />
        )}
        
        {inTransit > 0 && (
          <div
            className="absolute left-0 right-0 bg-gradient-to-t from-amber-600 to-amber-500 transition-all duration-300"
            style={{
              height: `${distribution.transitHeight}px`,
              bottom: `${bF + bD}px`,
              zIndex: 3
            }}
            title={`海运中: ${inTransit}`}
          />
        )}
        
        {atOverseas > 0 && (
          <div
            className="absolute left-0 right-0 bg-gradient-to-t from-violet-600 to-violet-500 transition-all duration-300"
            style={{
              height: `${distribution.overseasHeight}px`,
              bottom: `${bF + bD + bT}px`,
              zIndex: 4
            }}
            title={`海外仓: ${atOverseas}`}
          />
        )}
        
        {size !== "sm" && total > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <span className={`${textSizeClasses[size]} font-bold text-white drop-shadow-lg`}>
              {total}
            </span>
          </div>
        )}
      </div>
      
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
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-violet-500"></div>
          <span className={`${textSizeClasses[size]} text-slate-300`}>
            海外仓: {atOverseas}
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
