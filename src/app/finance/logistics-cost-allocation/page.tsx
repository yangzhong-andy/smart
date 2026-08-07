"use client";

import { useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { Package, TrendingDown, Box } from "lucide-react";

const truncate = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.trunc((value + (value >= 0 ? 1e-9 : -1e-9)) * factor) / factor;
};

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    truncate(Number.isFinite(n) ? n : 0)
  );

type AllocationItem = {
  containerNo: string;
  costType: string;
  totalContainerCost: number;
  containerVolumeCBM: number;
  currency: string;
  sku: string;
  qty: number;
  unitVolCBM: number;
  totalVolCBM: number;
  volumeRatio: number;
  allocatedCost: number;
  unitCost: number;
};

export default function LogisticsCostAllocationPage() {
  const [selectedContainer, setSelectedContainer] = useState<string>("");

  // 加载柜子列表
  const { data: containersData } = useSWR("/api/containers?pageSize=200", (url: string) =>
    fetch(url).then((r) => r.json()), { revalidateOnFocus: false }
  );
  const containers = Array.isArray(containersData?.data) ? containersData.data : (Array.isArray(containersData) ? containersData : []);

  // 加载全部分摊数据
  const { data: allocData, isLoading, mutate } = useSWR(
    "/api/logistics-cost-allocation",
    (url: string) => fetch(url).then((r) => r.json()),
    { revalidateOnFocus: false }
  );

  const allData: AllocationItem[] = allocData?.data || [];
  const summary = allocData?.summary || { totalCost: 0, containerCount: 0, skuCount: 0 };

  // 筛选
  const filteredData = useMemo(() => {
    if (!selectedContainer) return allData;
    return allData.filter((d) => d.containerNo === selectedContainer);
  }, [allData, selectedContainer]);

  const filteredSummary = useMemo(() => {
    const data = filteredData;
    const totalCost = data.reduce((s, d) => s + d.allocatedCost, 0);
    const skuSet = new Set(data.map(d => d.sku));
    return {
      totalCost: truncate(totalCost),
      containerCount: new Set(data.map(d => d.containerNo)).size,
      skuCount: skuSet.size,
    };
  }, [filteredData]);

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">物流费用分摊</h1>
          <p className="mt-1 text-sm text-slate-400">按产品体积比例分摊柜子物流费，核算单件产品成本</p>
        </div>
      </header>

      {/* 统计卡片 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-emerald-300/70" />
              <div className="text-xs font-medium text-white/70">总物流费</div>
            </div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {currency(selectedContainer ? filteredSummary.totalCost : summary.totalCost, "CNY")}
            </div>
            <div className="text-xs text-white/40 mt-1">柜子运费合计</div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Box className="h-4 w-4 text-blue-300/70" />
              <div className="text-xs font-medium text-white/70">柜子数</div>
            </div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {selectedContainer ? filteredSummary.containerCount : summary.containerCount}
            </div>
          </div>
        </div>
        <div className="group relative overflow-hidden rounded-2xl border p-5 shadow-lg transition-all hover:shadow-xl hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #0f172a 100%)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-20 w-20 rounded-full bg-white/5 blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-purple-300/70" />
              <div className="text-xs font-medium text-white/70">涉及SKU数</div>
            </div>
            <div className="text-3xl font-bold text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {selectedContainer ? filteredSummary.skuCount : summary.skuCount}
            </div>
          </div>
        </div>
      </section>

      {/* 柜子筛选 */}
      <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300 font-medium">选择柜子：</span>
          <select
            value={selectedContainer}
            onChange={(e) => setSelectedContainer(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="">全部柜子</option>
            {containers.map((c: any) => (
              <option key={c.id} value={c.containerNo}>{c.containerNo}</option>
            ))}
          </select>
          {selectedContainer && (
            <button onClick={() => setSelectedContainer("")} className="text-xs text-slate-400 hover:text-primary-400">
              清除
            </button>
          )}
        </div>
      </section>

      {/* 分摊明细表 */}
      <section className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-6 backdrop-blur-sm shadow-xl">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">分摊明细</h2>
        {isLoading ? (
          <div className="py-8 text-center text-slate-500">加载中...</div>
        ) : filteredData.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm">
              {allData.length === 0 ? "暂无数据，请先录入物流费和产品体积" : "该柜子没有匹配的记录"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-xs">
              <thead>
                <tr className="bg-slate-800/40">
                  <th className="px-3 py-3 text-left text-slate-400">柜号</th>
                  <th className="px-3 py-3 text-left text-slate-400">费用类型</th>
                  <th className="px-3 py-3 text-left text-slate-400">SKU</th>
                  <th className="px-3 py-3 text-right text-slate-400">数量</th>
                  <th className="px-3 py-3 text-right text-slate-400">单件体积(m³)</th>
                  <th className="px-3 py-3 text-right text-slate-400">总体积(m³)</th>
                  <th className="px-3 py-3 text-right text-slate-400">体积占比</th>
                  <th className="px-3 py-3 text-right text-slate-400">分摊费用</th>
                  <th className="px-3 py-3 text-right text-slate-400">单件费用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredData.map((d, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2 text-cyan-300 font-medium">{d.containerNo}</td>
                    <td className="px-3 py-2 text-slate-300">{d.costType}</td>
                    <td className="px-3 py-2 text-slate-200 font-medium">{d.sku}</td>
                    <td className="px-3 py-2 text-right text-slate-300">{d.qty}</td>
                    <td className="px-3 py-2 text-right text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.unitVolCBM.toFixed(6)}</td>
                    <td className="px-3 py-2 text-right text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{d.totalVolCBM.toFixed(6)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{d.volumeRatio}%</td>
                    <td className="px-3 py-2 text-right text-emerald-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {d.currency} {d.allocatedCost.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-300 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {d.currency} {d.unitCost.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
