"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Plus, X, Download, ChevronDown, ChevronUp } from "lucide-react";
import { PageHeader, ActionButton } from "@/components/ui";

const fetcher = (url: string) => fetch(url).then(res => res.json());

type Report = {
  id: string;
  date: string;
  month?: string | null;
  storeId?: string | null;
  operations?: string | null;
  gmv?: number | null;
  totalQty?: number | null;
  orderCount?: number | null;
  avgOrderQty?: number | null;
  set3Qty?: number | null;
  set3Ratio?: number | null;
  set1Qty?: number | null;
  set1Ratio?: number | null;
  rechargeQty?: number | null;
  rechargeRatio?: number | null;
  avgPriceRange?: string | null;
  price?: string | null;
  selfVideoCount?: number | null;
  influVideoCount?: number | null;
  targetRoi?: number | null;
  adCost?: number | null;
  costPerOrder?: number | null;
  actualRoi?: number | null;
  tr?: string | null;
  totalCost?: number | null;
  grossProfit?: number | null;
  profitMargin?: number | null;
  refundAmount?: number | null;
  extraCost?: string | null;
  totalPromoCost?: number | null;
  estProfitRate?: number | null;
  estProfit?: number | null;
  influGmv?: number | null;
  influOrders?: number | null;
  videoExposure?: number | null;
  videoClicks?: number | null;
  videoClickRate?: number | null;
  videoConvRate?: number | null;
  influCommission?: number | null;
  influAdCommission?: number | null;
  agencyCommission?: number | null;
  agencyAdCommission?: number | null;
  influCommissionRate?: number | null;
  influRatio?: number | null;
  agencyCommissionRate?: number | null;
  totalCommissionRate?: number | null;
  selfVideoGmv?: number | null;
  selfVideoOrders?: number | null;
  selfVideoExposure?: number | null;
  selfVideoClicks?: number | null;
  selfVideoClickRate?: number | null;
  selfVideoConvRate?: number | null;
  selfVideoRatio?: number | null;
  productCardGmv?: number | null;
  productCardExposure?: number | null;
  productCardConvRate?: number | null;
  productCardRatio?: number | null;
  warehouseStock?: number | null;
  transitStock?: number | null;
  saleableDays?: number | null;
  liveGmv?: number | null;
  liveExposure?: number | null;
  liveConvRate?: number | null;
  liveRatio?: number | null;
  notes?: string | null;
};

const num = (v: number | null | undefined, decimals = 2) => {
  if (v == null || !Number.isFinite(v)) return "-";
  return v.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

const int = (v: number | null | undefined) => {
  if (v == null) return "-";
  return v.toLocaleString("zh-CN");
};

export default function DailyReportPage() {
  const { data, isLoading, mutate } = useSWR("/api/daily-reports?page=1&pageSize=500", fetcher);
  const reports: Report[] = data?.data || [];
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [reports]);

  const openModal = () => {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      month: new Date().toLocaleDateString("zh-CN", { month: "long" }),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date) { toast.error("请填写日期"); return; }
    setSubmitting(true);
    try {
      const payload: any = {};
      for (const [key, value] of Object.entries(form)) {
        if (value === "" || value == null) continue;
        const numFields = ["gmv","totalQty","orderCount","avgOrderQty","set3Qty","set3Ratio","set1Qty","set1Ratio","rechargeQty","rechargeRatio","selfVideoCount","influVideoCount","targetRoi","adCost","costPerOrder","actualRoi","totalCost","grossProfit","profitMargin","refundAmount","totalPromoCost","estProfitRate","estProfit","influGmv","influOrders","videoExposure","videoClicks","videoClickRate","videoConvRate","influCommission","influAdCommission","agencyCommission","agencyAdCommission","influCommissionRate","influRatio","agencyCommissionRate","totalCommissionRate","selfVideoGmv","selfVideoOrders","selfVideoExposure","selfVideoClicks","selfVideoClickRate","selfVideoConvRate","selfVideoRatio","productCardGmv","productCardExposure","productCardConvRate","productCardRatio","warehouseStock","transitStock","saleableDays","liveGmv","liveExposure","liveConvRate","liveRatio"];
        if (numFields.includes(key)) {
          payload[key] = Number(value);
        } else {
          payload[key] = value;
        }
      }
      const res = await fetch("/api/daily-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "创建失败");
      toast.success("报表已保存");
      setModalOpen(false);
      mutate();
      setTimeout(() => window.location.reload(), 300);
    } catch (err: any) {
      toast.error(err?.message || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="每日运营报表"
        description="记录每日运营数据：销量、广告、利润、达人、商品卡、库存等"
        actions={
          <ActionButton icon={Plus} onClick={openModal}>填写报表</ActionButton>
        }
      />

      {/* 列表 */}
      {isLoading ? (
        <div className="text-center text-slate-400 py-12">加载中...</div>
      ) : sortedReports.length === 0 ? (
        <div className="text-center text-slate-400 py-12">暂无报表数据，点击右上角"填写报表"开始记录</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/50 sticky top-0">
              <tr className="text-slate-400">
                <th className="px-2 py-2 text-left whitespace-nowrap">日期</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">运营动作</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">GMV</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">件数</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">订单</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">客单价</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">视频</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">广告费</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">实际ROI</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">毛利</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">毛利率</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">预估利润</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">利润率</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">达人GMV</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">商品卡GMV</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">在仓库存</th>
                <th className="px-2 py-2 text-center">详情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sortedReports.map((r) => (
                <>
                  <tr key={r.id} className="hover:bg-slate-800/30">
                    <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 py-2 text-slate-400 max-w-[120px] truncate" title={r.operations || ""}>{r.operations || "-"}</td>
                    <td className="px-2 py-2 text-right text-slate-200 tabular-nums">{num(r.gmv)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{int(r.totalQty)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{int(r.orderCount)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 whitespace-nowrap">{r.price || "-"}</td>
                    <td className="px-2 py-2 text-right text-slate-400 whitespace-nowrap">{r.selfVideoCount || 0}/{r.influVideoCount || 0}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{num(r.adCost)}</td>
                    <td className="px-2 py-2 text-right text-slate-300 tabular-nums">{r.actualRoi != null ? String(r.actualRoi) : "-"}</td>
                    <td className="px-2 py-2 text-right text-emerald-300 tabular-nums">{num(r.grossProfit)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{r.profitMargin ? (r.profitMargin * 100).toFixed(2) + "%" : "-"}</td>
                    <td className="px-2 py-2 text-right text-emerald-300 tabular-nums">{num(r.estProfit)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{r.estProfitRate ? (r.estProfitRate * 100).toFixed(2) + "%" : "-"}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{num(r.influGmv)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{num(r.productCardGmv)}</td>
                    <td className="px-2 py-2 text-right text-slate-400 tabular-nums">{int(r.warehouseStock)}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)} className="text-slate-400 hover:text-slate-200">
                        {expandedRow === r.id ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}
                      </button>
                    </td>
                  </tr>
                  {expandedRow === r.id && (
                    <tr className="bg-slate-950/50">
                      <td colSpan={17} className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                          <DetailItem label="三件套" value={`${int(r.set3Qty)} (${r.set3Ratio ? (r.set3Ratio * 100).toFixed(1) + "%" : "-"})`} />
                          <DetailItem label="一件套" value={`${int(r.set1Qty)} (${r.set1Ratio ? (r.set1Ratio * 100).toFixed(1) + "%" : "-"})`} />
                          <DetailItem label="补能装" value={`${int(r.rechargeQty)} (${r.rechargeRatio ? (r.rechargeRatio * 100).toFixed(1) + "%" : "-"})`} />
                          <DetailItem label="单均件数" value={num(r.avgOrderQty)} />
                          <DetailItem label="平均客单价" value={r.avgPriceRange || "-"} />
                          <DetailItem label="ROI设置" value={r.targetRoi != null ? String(r.targetRoi) : "-"} />
                          <DetailItem label="单转" value={num(r.costPerOrder)} />
                          <DetailItem label="TR" value={r.tr || "-"} />
                          <DetailItem label="商品总成本" value={num(r.totalCost)} />
                          <DetailItem label="退款+取消" value={num(r.refundAmount)} />
                          <DetailItem label="额外费用" value={r.extraCost || "-"} />
                          <DetailItem label="总推广成本" value={num(r.totalPromoCost)} />
                          <DetailItem label="达人佣金" value={num(r.influCommission)} />
                          <DetailItem label="达人广告佣金" value={num(r.influAdCommission)} />
                          <DetailItem label="机构佣金" value={num(r.agencyCommission)} />
                          <DetailItem label="达人佣金率" value={r.influCommissionRate ? (r.influCommissionRate * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="达人占比" value={r.influRatio ? (r.influRatio * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="总佣金率" value={r.totalCommissionRate ? (r.totalCommissionRate * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="视频曝光" value={int(r.videoExposure)} />
                          <DetailItem label="视频点击" value={int(r.videoClicks)} />
                          <DetailItem label="视频点击率" value={r.videoClickRate ? (r.videoClickRate * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="视频转化率" value={r.videoConvRate ? (r.videoConvRate * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="自制视频GMV" value={num(r.selfVideoGmv)} />
                          <DetailItem label="自制视频曝光" value={int(r.selfVideoExposure)} />
                          <DetailItem label="商品卡曝光" value={int(r.productCardExposure)} />
                          <DetailItem label="商品卡转化率" value={r.productCardConvRate ? (r.productCardConvRate * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="商品卡占比" value={r.productCardRatio ? (r.productCardRatio * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="在途库存" value={int(r.transitStock)} />
                          <DetailItem label="可售天数" value={int(r.saleableDays)} />
                          <DetailItem label="直播GMV" value={num(r.liveGmv)} />
                          <DetailItem label="直播曝光" value={int(r.liveExposure)} />
                          <DetailItem label="直播转化率" value={r.liveConvRate ? (r.liveConvRate * 100).toFixed(2) + "%" : "-"} />
                          <DetailItem label="直播占比" value={r.liveRatio ? (r.liveRatio * 100).toFixed(2) + "%" : "-"} />
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 填写报表弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">填写每日运营报表</h2>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-200"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 基本信息 */}
              <FormSection title="基本信息">
                <FormField label="日期" value={form.date || ""} onChange={(v) => updateField("date", v)} type="date" required />
                <FormField label="月份" value={form.month || ""} onChange={(v) => updateField("month", v)} />
                <FormField label="运营动作" value={form.operations || ""} onChange={(v) => updateField("operations", v)} />
              </FormSection>

              {/* 当日销量 */}
              <FormSection title="当日销量">
                <FormField label="GMV" value={form.gmv || ""} onChange={(v) => updateField("gmv", v)} type="number" />
                <FormField label="总件数" value={form.totalQty || ""} onChange={(v) => updateField("totalQty", v)} type="number" />
                <FormField label="订单量" value={form.orderCount || ""} onChange={(v) => updateField("orderCount", v)} type="number" />
                <FormField label="三件套件数" value={form.set3Qty || ""} onChange={(v) => updateField("set3Qty", v)} type="number" />
                <FormField label="一件套件数" value={form.set1Qty || ""} onChange={(v) => updateField("set1Qty", v)} type="number" />
                <FormField label="补能装件数" value={form.rechargeQty || ""} onChange={(v) => updateField("rechargeQty", v)} type="number" />
                <FormField label="平均客单价" value={form.avgPriceRange || ""} onChange={(v) => updateField("avgPriceRange", v)} />
                <FormField label="客单价" value={form.price || ""} onChange={(v) => updateField("price", v)} />
              </FormSection>

              {/* 每日新增视频数 */}
              <FormSection title="每日新增视频数">
                <FormField label="自制" value={form.selfVideoCount || ""} onChange={(v) => updateField("selfVideoCount", v)} type="number" />
                <FormField label="达人" value={form.influVideoCount || ""} onChange={(v) => updateField("influVideoCount", v)} type="number" />
              </FormSection>

              {/* 广告数据 */}
              <FormSection title="广告数据">
                <FormField label="ROI设置" value={form.targetRoi || ""} onChange={(v) => updateField("targetRoi", v)} type="number" />
                <FormField label="广告花费" value={form.adCost || ""} onChange={(v) => updateField("adCost", v)} type="number" />
                <FormField label="单转" value={form.costPerOrder || ""} onChange={(v) => updateField("costPerOrder", v)} type="number" />
                <FormField label="实际ROI" value={form.actualRoi || ""} onChange={(v) => updateField("actualRoi", v)} type="number" />
                <FormField label="TR" value={form.tr || ""} onChange={(v) => updateField("tr", v)} />
              </FormSection>

              {/* 利润数据 */}
              <FormSection title="利润数据">
                <FormField label="商品总成本" value={form.totalCost || ""} onChange={(v) => updateField("totalCost", v)} type="number" />
                <FormField label="毛利" value={form.grossProfit || ""} onChange={(v) => updateField("grossProfit", v)} type="number" />
                <FormField label="毛利率" value={form.profitMargin || ""} onChange={(v) => updateField("profitMargin", v)} type="number" />
                <FormField label="退款+取消" value={form.refundAmount || ""} onChange={(v) => updateField("refundAmount", v)} type="number" />
                <FormField label="额外费用" value={form.extraCost || ""} onChange={(v) => updateField("extraCost", v)} />
                <FormField label="总推广成本" value={form.totalPromoCost || ""} onChange={(v) => updateField("totalPromoCost", v)} type="number" />
                <FormField label="预估实际利润率" value={form.estProfitRate || ""} onChange={(v) => updateField("estProfitRate", v)} type="number" />
                <FormField label="预估实际利润" value={form.estProfit || ""} onChange={(v) => updateField("estProfit", v)} type="number" />
              </FormSection>

              {/* 达人佣金数据 */}
              <FormSection title="达人佣金数据/视频情况">
                <FormField label="达人GMV" value={form.influGmv || ""} onChange={(v) => updateField("influGmv", v)} type="number" />
                <FormField label="订单数" value={form.influOrders || ""} onChange={(v) => updateField("influOrders", v)} type="number" />
                <FormField label="视频曝光" value={form.videoExposure || ""} onChange={(v) => updateField("videoExposure", v)} type="number" />
                <FormField label="视频点击数" value={form.videoClicks || ""} onChange={(v) => updateField("videoClicks", v)} type="number" />
                <FormField label="达人佣金" value={form.influCommission || ""} onChange={(v) => updateField("influCommission", v)} type="number" />
                <FormField label="达人广告佣金" value={form.influAdCommission || ""} onChange={(v) => updateField("influAdCommission", v)} type="number" />
                <FormField label="机构佣金" value={form.agencyCommission || ""} onChange={(v) => updateField("agencyCommission", v)} type="number" />
                <FormField label="机构广告佣金" value={form.agencyAdCommission || ""} onChange={(v) => updateField("agencyAdCommission", v)} type="number" />
              </FormSection>

              {/* 自制视频数据 */}
              <FormSection title="自制视频数据">
                <FormField label="视频GMV" value={form.selfVideoGmv || ""} onChange={(v) => updateField("selfVideoGmv", v)} type="number" />
                <FormField label="订单数" value={form.selfVideoOrders || ""} onChange={(v) => updateField("selfVideoOrders", v)} type="number" />
                <FormField label="视频曝光" value={form.selfVideoExposure || ""} onChange={(v) => updateField("selfVideoExposure", v)} type="number" />
                <FormField label="视频点击数" value={form.selfVideoClicks || ""} onChange={(v) => updateField("selfVideoClicks", v)} type="number" />
              </FormSection>

              {/* 商品卡数据 */}
              <FormSection title="商品卡数据">
                <FormField label="商品卡GMV" value={form.productCardGmv || ""} onChange={(v) => updateField("productCardGmv", v)} type="number" />
                <FormField label="商品卡曝光" value={form.productCardExposure || ""} onChange={(v) => updateField("productCardExposure", v)} type="number" />
              </FormSection>

              {/* 剩余库存 */}
              <FormSection title="剩余库存">
                <FormField label="在仓库存" value={form.warehouseStock || ""} onChange={(v) => updateField("warehouseStock", v)} type="number" />
                <FormField label="在途库存" value={form.transitStock || ""} onChange={(v) => updateField("transitStock", v)} type="number" />
                <FormField label="可售天数" value={form.saleableDays || ""} onChange={(v) => updateField("saleableDays", v)} type="number" />
              </FormSection>

              {/* 直播数据 */}
              <FormSection title="直播数据">
                <FormField label="直播GMV" value={form.liveGmv || ""} onChange={(v) => updateField("liveGmv", v)} type="number" />
                <FormField label="直播曝光" value={form.liveExposure || ""} onChange={(v) => updateField("liveExposure", v)} type="number" />
              </FormSection>

              <div className="flex justify-end gap-2 pt-2">
                <ActionButton type="button" variant="secondary" onClick={() => setModalOpen(false)}>取消</ActionButton>
                <ActionButton type="submit" isLoading={submitting}>保存</ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-800/40 px-2 py-1.5">
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-200 font-medium">{value}</div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-medium text-slate-300 mb-2 border-b border-slate-800 pb-1">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </div>
  );
}

function FormField({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-slate-400">{label} {required && <span className="text-rose-400">*</span>}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={type === "number" ? "0.01" : undefined}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
      />
    </label>
  );
}
