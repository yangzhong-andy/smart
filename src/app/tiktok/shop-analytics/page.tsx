"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, TrendingUp, Users, ShoppingBag, Eye, DollarSign, Package, Percent, Video, Radio, LayoutGrid, ChevronDown, ChevronRight } from "lucide-react";

export default function TikTokShopAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shops, setShops] = useState<{shopId:string;shopName:string}[]>([]);
  const [shopId, setShopId] = useState("");
  const [dateRange, setDateRange] = useState<"7" | "14" | "30">("7");
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [videoProducts, setVideoProducts] = useState<any[]>([]);
  const [videoDetail, setVideoDetail] = useState<any>(null);
  const [videoProductsLoading, setVideoProductsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/tiktok/data?type=shops").then(r => r.json()).then(d => {
      const list = d.shops || [];
      setShops(list);
      if (list.length > 0) setShopId(list[0].shopId);
    }).catch(() => {});
  }, []);

  // 计算日期范围（用UTC，跟前端一致）
  const getDates = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    // 前端数据更新到前一天，所以end往前推1天
    const endDate = new Date(end.getTime() - 86400000);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    };
  };

  const fetchData = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getDates(parseInt(dateRange) + 1);
      const res = await fetch(`/api/tiktok/shop-analytics?shopId=${shopId}&startDate=${startDate}&endDate=${endDate}`);
      const d = await res.json();
      if (d.success) setData(d.data);
      else { setData(null); toast.error(d.error || "加载失败"); }
    } catch { toast.error("加载失败"); }
    setLoading(false);
  }, [shopId, dateRange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleExpandVideo = async (videoId: string) => {
    if (expandedVideo === videoId) { setExpandedVideo(null); return; }
    setExpandedVideo(videoId);
    setVideoProductsLoading(true);
    try {
      const { startDate, endDate } = getDates(parseInt(dateRange) + 1);
      const res = await fetch(`/api/tiktok/video-products?shopId=${shopId}&videoId=${videoId}&startDate=${startDate}&endDate=${endDate}`);
      const d = await res.json();
      setVideoProducts(d.success ? (d.products || []) : []);
      setVideoDetail(d.success ? d.detail : null);
    } catch { setVideoProducts([]); setVideoDetail(null); }
    setVideoProductsLoading(false);
  };

  const fmtMoney = (v: string, currency = "BRL") => {
    const n = parseFloat(v || "0");
    return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  };
  const fmtPct = (v: string) => `${(parseFloat(v || "0") * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString("en-US");

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      {/* 标题 + 筛选 */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">📊 商店分析</h1>
          <p className="text-sm text-slate-400 mt-1">
            {shops.find(s => s.shopId === shopId)?.shopName || ""}
            {data?.latestAvailableDate && ` · 数据更新: ${data.latestAvailableDate}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {shops.length > 1 && (
            <select value={shopId} onChange={(e) => setShopId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200">
              {shops.map(s => <option key={s.shopId} value={s.shopId}>{s.shopName}</option>)}
            </select>
          )}
          <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
            {([["7","7天"],["14","14天"],["30","30天"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setDateRange(k)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${dateRange === k ? "bg-primary-500 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-500"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />加载中...</div>
      ) : !data ? (
        <div className="text-center py-20 text-slate-500">暂无数据</div>
      ) : (
        <>
          {/* 今日概览 */}
      {data.today && (
        <div className="rounded-xl border border-primary-800/40 bg-primary-900/10 p-5">
          <h3 className="text-base font-semibold text-primary-300 mb-4 flex items-center gap-2">
            📅 今日概览 <span className="text-xs text-slate-500 font-normal">（UTC日期: {new Date().toISOString().split("T")[0]}）</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日GMV</div>
              <div className="text-lg font-bold text-emerald-300 mt-1">{fmtMoney(data.today.gmv, data.today.currency)}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">今日订单</div>
              <div className="text-lg font-bold text-blue-300 mt-1">{data.today.orders}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">售出商品</div>
              <div className="text-lg font-bold text-cyan-300 mt-1">{fmtNum(data.today.itemsSold)}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">客户数</div>
              <div className="text-lg font-bold text-purple-300 mt-1">{fmtNum(data.today.customers)}</div>
            </div>
            <div className="text-center rounded-lg bg-slate-800/40 p-3">
              <div className="text-xs text-slate-400">访客数</div>
              <div className="text-lg font-bold text-amber-300 mt-1">{fmtNum(data.today.visitors)}</div>
            </div>
          </div>
        </div>
      )}

      {/* 核心指标卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={<DollarSign className="h-5 w-5" />} label="GMV" value={fmtMoney(data.gmv.total, data.gmv.currency)} color="text-emerald-400 bg-emerald-500/10" />
            <MetricCard icon={<Users className="h-5 w-5" />} label="客户数" value={fmtNum(data.avgCustomersCount)} color="text-blue-400 bg-blue-500/10" />
            <MetricCard icon={<ShoppingBag className="h-5 w-5" />} label="SKU订单数" value={fmtNum(data.skuOrdersCount)} color="text-purple-400 bg-purple-500/10" />
            <MetricCard icon={<Eye className="h-5 w-5" />} label="访客数" value={fmtNum(data.avgVisitors)} color="text-amber-400 bg-amber-500/10" />
          </div>

          {/* 第二行指标 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={<Package className="h-5 w-5" />} label="售出商品" value={fmtNum(data.itemsSold)} color="text-cyan-400 bg-cyan-500/10" />
            <MetricCard icon={<ShoppingBag className="h-5 w-5" />} label="订单数" value={fmtNum(data.ordersCount)} color="text-indigo-400 bg-indigo-500/10" />
            <MetricCard icon={<Percent className="h-5 w-5" />} label="转化率" value={fmtPct(data.avgConversionRate)} color="text-rose-400 bg-rose-500/10" />
            <MetricCard icon={<Eye className="h-5 w-5" />} label="页面浏览" value={fmtNum(data.avgPageViews)} color="text-teal-400 bg-teal-500/10" />
          </div>

          {/* GMV来源分布 + 收入退款 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GMV来源分布 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="text-base font-semibold text-slate-200 mb-4">GMV 来源分布</h3>
              <div className="space-y-3">
                {data.gmv.breakdowns.map((b: any) => {
                  const total = parseFloat(data.gmv.total);
                  const amount = parseFloat(b.amount);
                  const pct = total > 0 ? (amount / total) * 100 : 0;
                  const icons: Record<string, React.ReactNode> = {
                    LIVE: <Radio className="h-4 w-4" />,
                    VIDEO: <Video className="h-4 w-4" />,
                    PRODUCT_CARD: <LayoutGrid className="h-4 w-4" />,
                  };
                  const labels: Record<string, string> = {
                    LIVE: "直播",
                    VIDEO: "视频",
                    PRODUCT_CARD: "商品卡片",
                  };
                  const colors: Record<string, string> = {
                    LIVE: "bg-rose-500",
                    VIDEO: "bg-purple-500",
                    PRODUCT_CARD: "bg-amber-500",
                  };
                  return (
                    <div key={b.type} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-28">
                        <span className="text-slate-400">{icons[b.type]}</span>
                        <span className="text-sm text-slate-300">{labels[b.type] || b.type}</span>
                      </div>
                      <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden">
                        <div className={`h-full ${colors[b.type] || "bg-slate-600"} rounded transition-all`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="text-right w-36">
                        <div className="text-sm text-slate-200 font-medium">{fmtMoney(b.amount, b.currency)}</div>
                        <div className="text-xs text-slate-500">{pct.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 收入与退款 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="text-base font-semibold text-slate-200 mb-4">收入与退款</h3>
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400"><TrendingUp className="h-4 w-4" /><span className="text-sm">总收入</span></div>
                    <span className="text-xl font-bold text-emerald-300">{fmtMoney(data.grossRevenue.amount, data.grossRevenue.currency)}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-rose-800/50 bg-rose-900/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-rose-400"><DollarSign className="h-4 w-4" /><span className="text-sm">退款金额</span></div>
                    <span className="text-xl font-bold text-rose-300">{fmtMoney(data.refunds.amount, data.refunds.currency)}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-center">
                    <div className="text-xs text-slate-400">客单价</div>
                    <div className="text-lg font-bold text-slate-200 mt-1">
                      {data.ordersCount > 0 ? fmtMoney((parseFloat(data.gmv.total) / data.ordersCount).toFixed(2), data.gmv.currency) : "-"}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 text-center">
                    <div className="text-xs text-slate-400">退款率</div>
                    <div className="text-lg font-bold text-slate-200 mt-1">
                      {parseFloat(data.gmv.total) > 0 ? `${((parseFloat(data.refunds.amount) / parseFloat(data.gmv.total)) * 100).toFixed(1)}%` : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 视频性能 */}
          {data.video && (
            <div className="rounded-xl border border-purple-800/40 bg-purple-900/10 p-5">
              <h3 className="text-base font-semibold text-purple-300 mb-4 flex items-center gap-2">
                <Video className="h-5 w-5" /> 视频性能概览
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-xs text-slate-400">视频GMV</div>
                  <div className="text-lg font-bold text-purple-300 mt-1">{fmtMoney(data.video.gmv, data.video.currency)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">SKU订单</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">{fmtNum(data.video.skuOrders)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">客户数</div>
                  <div className="text-lg font-bold text-slate-200 mt-1">{fmtNum(data.video.avgCustomers)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">商品曝光</div>
                  <div className="text-lg font-bold text-blue-300 mt-1">{fmtNum(data.video.productImpressions)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">商品点击</div>
                  <div className="text-lg font-bold text-cyan-300 mt-1">{fmtNum(data.video.productClicks)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-slate-400">点击率</div>
                  <div className="text-lg font-bold text-amber-300 mt-1">{(parseFloat(data.video.clickThroughRate) * 100).toFixed(2)}%</div>
                </div>
              </div>
            </div>
          )}

          {/* TOP视频列表 */}
          {data.topVideos && data.topVideos.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="text-base font-semibold text-slate-200 mb-4">
                🎬 热门视频 TOP{data.topVideos.length}
                <span className="text-xs text-slate-500 ml-2">共 {data.videoTotalCount} 条视频</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-2 pr-3 w-8"></th>
                      <th className="pb-2 pr-3 w-8">#</th>
                      <th className="pb-2 pr-3">视频</th>
                      <th className="pb-2 pr-3 text-right">播放量</th>
                      <th className="pb-2 pr-3 text-right">GMV</th>
                      <th className="pb-2 pr-3 text-right">售出</th>
                      <th className="pb-2 pr-3 text-right">点击率</th>
                      <th className="pb-2 pr-3">发布时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topVideos.map((v: any, i: number) => (
                      <>
                        <tr key={v.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 cursor-pointer" onClick={() => handleExpandVideo(v.id)}>
                          <td className="py-2 pr-3">
                            {expandedVideo === v.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </td>
                          <td className="py-2 pr-3 text-slate-500 font-medium">{i + 1}</td>
                          <td className="py-2 pr-3 max-w-xs">
                            <div className="text-slate-300 truncate">{v.title || "-"}</div>
                            <div className="text-slate-500 flex items-center gap-2">
                              <span className="text-blue-400 font-medium">@{v.username}</span>
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                v.isChannel
                                  ? "bg-blue-500/20 border border-blue-500/30 text-blue-300"
                                  : "bg-emerald-500/20 border border-emerald-500/30 text-emerald-300"
                              }`}>{v.isChannel ? "渠道号" : "达人"}</span>
                              <a href={`https://www.tiktok.com/@${v.username}/video/${v.id}`} target="_blank" rel="noopener noreferrer"
                                className="text-primary-400 hover:text-primary-300 inline-flex items-center gap-1">
                                <Video className="h-3 w-3" />观看视频
                              </a>
                              <span>· {v.hashtags?.slice(0, 2).join(" ")}</span>
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right text-blue-400">{fmtNum(v.views)}</td>
                          <td className="py-2 pr-3 text-right text-emerald-400 font-medium">{fmtMoney(v.gmv, v.currency)}</td>
                          <td className="py-2 pr-3 text-right text-slate-300">{v.itemsSold}</td>
                          <td className="py-2 pr-3 text-right text-amber-400">{(parseFloat(v.clickThroughRate) * 100).toFixed(2)}%</td>
                          <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{v.postTime?.split(" ")[0] || "-"}</td>
                        </tr>
                        {expandedVideo === v.id && (
                          <tr className="bg-slate-800/20">
                            <td colSpan={8} className="px-8 py-4">
                              {videoProductsLoading ? (
                                <div className="text-center text-slate-500 text-xs py-2"><Loader2 className="h-3 w-3 animate-spin inline mr-1" />加载视频详情...</div>
                              ) : videoProducts.length === 0 && !videoDetail ? (
                                <div className="text-center text-slate-500 text-xs py-2">暂无数据</div>
                              ) : (
                                <div className="space-y-4">
                                  {/* 流量与互动 */}
                                  {videoDetail && (
                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                      <div className="text-center rounded bg-slate-800/40 px-2 py-1.5">
                                        <div className="text-[10px] text-slate-500">播放</div>
                                        <div className="text-sm text-blue-400 font-medium">{fmtNum(videoDetail.traffic.views)}</div>
                                      </div>
                                      <div className="text-center rounded bg-slate-800/40 px-2 py-1.5">
                                        <div className="text-[10px] text-slate-500">点赞</div>
                                        <div className="text-sm text-rose-400 font-medium">{fmtNum(videoDetail.traffic.likes)}</div>
                                      </div>
                                      <div className="text-center rounded bg-slate-800/40 px-2 py-1.5">
                                        <div className="text-[10px] text-slate-500">评论</div>
                                        <div className="text-sm text-slate-300 font-medium">{fmtNum(videoDetail.traffic.comments)}</div>
                                      </div>
                                      <div className="text-center rounded bg-slate-800/40 px-2 py-1.5">
                                        <div className="text-[10px] text-slate-500">分享</div>
                                        <div className="text-sm text-cyan-400 font-medium">{fmtNum(videoDetail.traffic.shares)}</div>
                                      </div>
                                      <div className="text-center rounded bg-slate-800/40 px-2 py-1.5">
                                        <div className="text-[10px] text-slate-500">新增粉丝</div>
                                        <div className="text-sm text-emerald-400 font-medium">{fmtNum(videoDetail.traffic.newFollowers)}</div>
                                      </div>
                                      <div className="text-center rounded bg-slate-800/40 px-2 py-1.5">
                                        <div className="text-[10px] text-slate-500">GPM</div>
                                        <div className="text-sm text-amber-400 font-medium">{videoDetail.sales.gpm}</div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 商品性能 */}
                                  {videoProducts.length > 0 && (
                                    <div>
                                      <div className="text-xs text-slate-400 mb-1">商品性能</div>
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-slate-500 border-b border-slate-700/30">
                                            <th className="px-2 py-1 text-left">商品ID</th>
                                            <th className="px-2 py-1 text-right">GMV</th>
                                            <th className="px-2 py-1 text-right">售出</th>
                                            <th className="px-2 py-1 text-right">日均买家</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {videoProducts.map((p) => (
                                            <tr key={p.productId} className="border-b border-slate-700/20">
                                              <td className="px-2 py-1 font-mono text-slate-400">{p.productId}</td>
                                              <td className="px-2 py-1 text-right text-emerald-400">{fmtMoney(p.gmv)}</td>
                                              <td className="px-2 py-1 text-right text-slate-300">{p.unitsSold}</td>
                                              <td className="px-2 py-1 text-right text-slate-400">{p.dailyAvgBuyers}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color} mb-3`}>{icon}</div>
      <div className="text-xl font-bold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}
