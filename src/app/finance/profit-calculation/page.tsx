"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Calculator, CircleAlert, Gem, Package, Save, Trash2 } from "lucide-react";

type ProductOption = {
  id: string;
  skuId: string;
  name: string;
  purchaseCostCny: number;
  weightKg: number | null;
};

type HistoryItem = {
  id: string;
  productName: string;
  skuId: string | null;
  isCommissionFree: boolean;
  /** 营业额(BRL)，接口由 有效售价×件数 推算 */
  grossRevenueBrl: number;
  exchangeRate: number;
  netProfitCny: number;
  settlementBrl: number;
  breakEvenRoi: number;
  createdAt: string;
};

type ShippingMode = "SFP" | "WAREHOUSE_3PL";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`请求失败: ${res.status}`);
  return res.json();
};

const num = (value: number) => (Number.isFinite(value) ? value : 0);
const money = (value: number | null | undefined) =>
  num(Number(value ?? 0)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdMoney = (value: number | null | undefined, usdRate: number) =>
  money(num(Number(value ?? 0)) / (usdRate > 0 ? usdRate : 1));
const inputClassName =
  "mt-1.5 w-full rounded-lg border border-slate-700/70 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition-all focus:border-cyan-500/70 focus:ring-2 focus:ring-cyan-500/20";
const labelClassName = "text-xs tracking-wide text-slate-400";

function get3PLBaseFeeByWeight(weightKg: number): number {
  if (weightKg <= 0) return 0;
  if (weightKg <= 1) return 3.5;
  if (weightKg <= 3) return 4.3;
  if (weightKg <= 6) return 5;
  if (weightKg <= 10) return 8;
  if (weightKg <= 20) return 14;
  if (weightKg <= 30) return 20;
  if (weightKg <= 40) return 30;
  if (weightKg <= 50) return 33;
  if (weightKg <= 60) return 40;
  if (weightKg <= 70) return 47;
  return 47;
}

export default function ProfitCalculationPage() {
  const { data: products = [] } = useSWR<ProductOption[]>("/api/profit-calculations/products", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: history = [] } = useSWR<HistoryItem[]>("/api/profit-calculations", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: financeRates } = useSWR<{ success: boolean; data?: { USD?: number } }>("/api/finance-rates", fetcher, {
    revalidateOnFocus: false,
  });

  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [purchaseCostCny, setPurchaseCostCny] = useState<number | "">(0);
  const [weightKg, setWeightKg] = useState<number | "">("");
  const [firstLegShippingCny, setFirstLegShippingCny] = useState<number | "">(0);
  /** 留空则按 6%；有值则按「结算额(CNY)×该百分比」摊到每件成本 */
  const [invoiceFeePercentManual, setInvoiceFeePercentManual] = useState<number | "">("");
  const [adCostCny, setAdCostCny] = useState<number | "">(0);
  /** 留空则按 1%；有值则按「结算额(CNY)×该百分比」摊到每件成本 */
  const [remittanceFeePercentManual, setRemittanceFeePercentManual] = useState<number | "">("");
  const [salePriceBrl, setSalePriceBrl] = useState<number | "">(0);
  const [discountSalePriceBrl, setDiscountSalePriceBrl] = useState<number | "">("");
  const [exchangeRate, setExchangeRate] = useState<number | "">(1.35);
  /** 留空则用系统汇率接口，否则用手填 1 USD = ? CNY */
  const [usdManualRate, setUsdManualRate] = useState<number | "">("");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [shippingMode, setShippingMode] = useState<ShippingMode>("SFP");
  const [isCommissionFree, setIsCommissionFree] = useState(true);
  const [targetRoi, setTargetRoi] = useState<number | "">("");
  const apiUsdRate =
    financeRates?.success && Number(financeRates?.data?.USD) > 0 ? Number(financeRates?.data?.USD) : 7.2;
  const usdRate =
    usdManualRate !== "" && Number.isFinite(Number(usdManualRate)) && Number(usdManualRate) > 0
      ? num(Number(usdManualRate))
      : apiUsdRate;

  const calculated = useMemo(() => {
    const qty = Math.max(1, Math.trunc(num(Number(quantity))));
    const sale = num(Number(salePriceBrl));
    const discountSale = discountSalePriceBrl === "" ? 0 : num(Number(discountSalePriceBrl));
    const effectiveSale = discountSale > 0 ? discountSale : sale;
    const rate = num(Number(exchangeRate));
    const purchase = num(Number(purchaseCostCny));
    const firstLeg = num(Number(firstLegShippingCny));
    const ad = num(Number(adCostCny));
    const weight = num(weightKg === "" ? 0 : Number(weightKg));
    // 业务口径：SFP 与海外仓取件费可同时存在，因此海外仓操作费不再受发货模式限制
    const warehouseBaseFeePerOrder = get3PLBaseFeeByWeight(weight);
    const warehouseExtraByQty = qty > 1 ? (qty - 1) * 1.5 : 0;
    // 同一订单多件：基础费只收一次，再叠加加件费
    const warehouseRawFee = warehouseBaseFeePerOrder + warehouseExtraByQty;
    const warehouseFee = warehouseRawFee;
    const warehouseFeeCny = warehouseFee * rate;

    const sfpCommission = effectiveSale * 0.06 * qty;
    const extraPlatformRateFee = isCommissionFree ? 0 : effectiveSale * 0.06 * qty;
    const extraPlatformFixedFee = isCommissionFree ? 0 : 4 * qty;
    const extraPlatformFee = extraPlatformRateFee + extraPlatformFixedFee;
    // 业务口径：海外仓费不在结算额(BRL)扣减，单独在净利润阶段按 CNY 成本计入
    const settlementBrl = effectiveSale * qty - sfpCommission - extraPlatformFee;
    const settlementCny = settlementBrl * rate;
    const DEFAULT_INVOICE_FEE_PERCENT = 6;
    const invoiceFeePercentUsed =
      invoiceFeePercentManual !== "" &&
      Number.isFinite(Number(invoiceFeePercentManual)) &&
      Number(invoiceFeePercentManual) >= 0
        ? num(Number(invoiceFeePercentManual))
        : DEFAULT_INVOICE_FEE_PERCENT;
    const invoiceFeeTotalCny = settlementCny * (invoiceFeePercentUsed / 100);
    const invoiceFeePerPieceCny = qty > 0 ? invoiceFeeTotalCny / qty : 0;
    const invoiceFee = invoiceFeePerPieceCny;
    const DEFAULT_REMITTANCE_FEE_PERCENT = 1;
    const remittanceFeePercentUsed =
      remittanceFeePercentManual !== "" &&
      Number.isFinite(Number(remittanceFeePercentManual)) &&
      Number(remittanceFeePercentManual) >= 0
        ? num(Number(remittanceFeePercentManual))
        : DEFAULT_REMITTANCE_FEE_PERCENT;
    const remittanceFeeTotalCny = settlementCny * (remittanceFeePercentUsed / 100);
    const remittanceFeePerPieceCny = qty > 0 ? remittanceFeeTotalCny / qty : 0;
    const remittanceFee = remittanceFeePerPieceCny;

    const totalCostCny = (purchase + firstLeg + ad + invoiceFee + remittanceFee) * qty;
    const totalCostWithWarehouseCny = totalCostCny + warehouseFeeCny;
    const grossRevenueCny = effectiveSale * qty * rate;
    const netProfitCny = settlementBrl * rate - totalCostWithWarehouseCny;
    const netProfitBrl = rate > 0 ? netProfitCny / rate : 0;

    const roi = totalCostWithWarehouseCny > 0 ? grossRevenueCny / totalCostWithWarehouseCny : 0;
    // 保本 ROI = 营业额 / 净利润（净利润≠0）
    const breakEvenRoi =
      netProfitCny !== 0 && Number.isFinite(netProfitCny) ? grossRevenueCny / netProfitCny : 0;
    const profitRate = grossRevenueCny > 0 ? (netProfitCny / grossRevenueCny) * 100 : 0;

    // 目标 ROI 预期利润 = 净利润 - 目标ROI对应金额
    const expectedProfitCny =
      targetRoi === "" || !Number.isFinite(Number(targetRoi)) || Number(targetRoi) <= 0
        ? null
        : netProfitCny - grossRevenueCny / Number(targetRoi);
    const expectedProfitBrl =
      expectedProfitCny == null || rate <= 0 ? null : expectedProfitCny / rate;
    // 目标 ROI 对应金额 = 营业额(CNY) / 目标ROI
    const targetAdBudgetCny =
      targetRoi === "" || !Number.isFinite(Number(targetRoi)) || Number(targetRoi) <= 0
        ? null
        : grossRevenueCny / Number(targetRoi);
    // 展示用：营业额 ÷ 保本ROI（保本ROI = 营业额/净利润时，该值等于净利润）
    const breakEvenAdCostCny = breakEvenRoi !== 0 ? grossRevenueCny / breakEvenRoi : 0;

    return {
      qty,
      effectiveSale,
      sfpCommission,
      extraPlatformRateFee,
      extraPlatformFixedFee,
      extraPlatformFee,
      warehouseBaseFeePerOrder,
      warehouseExtraByQty,
      warehouseRawFee,
      warehouseFee,
      warehouseFeeCny,
      settlementCny,
      totalCostCny,
      totalCostWithWarehouseCny,
      invoiceFeePercentUsed,
      invoiceFeePerPieceCny,
      invoiceFeeTotalCny,
      remittanceFeePercentUsed,
      remittanceFeePerPieceCny,
      remittanceFeeTotalCny,
      grossRevenueCny,
      settlementBrl,
      netProfitBrl,
      netProfitCny,
      roi,
      breakEvenRoi,
      profitRate,
      expectedProfitCny,
      expectedProfitBrl,
      targetAdBudgetCny,
      breakEvenAdCostCny,
    };
  }, [
    quantity,
    salePriceBrl,
    discountSalePriceBrl,
    exchangeRate,
    purchaseCostCny,
    firstLegShippingCny,
    adCostCny,
    shippingMode,
    isCommissionFree,
    targetRoi,
    weightKg,
    invoiceFeePercentManual,
    remittanceFeePercentManual,
  ]);

  const warning = calculated.netProfitCny < 0 || calculated.roi < calculated.breakEvenRoi;

  const onSelectProduct = (id: string) => {
    setProductId(id);
    const selected = products.find((item) => item.id === id);
    if (!selected) return;
    setProductName(selected.name);
    setPurchaseCostCny(selected.purchaseCostCny || 0);
    setWeightKg(selected.weightKg ?? "");
    setInvoiceFeePercentManual("");
    setRemittanceFeePercentManual("");
  };

  const saveCalculation = async () => {
    if (!productName.trim()) {
      toast.error("请先填写商品名称");
      return;
    }

    const payload = {
      productId: productId || null,
      productName,
      purchaseCostCny: num(Number(purchaseCostCny)),
      weightKg: weightKg === "" ? null : num(weightKg),
      firstLegShippingCny: num(Number(firstLegShippingCny)),
      adCostCny: num(Number(adCostCny)),
      salePriceBrl: calculated.effectiveSale,
      exchangeRate: num(Number(exchangeRate)),
      quantity: calculated.qty,
      shippingMode,
      isCommissionFree,
      warehouseFeeBrl: calculated.warehouseFee,
      targetRoi: targetRoi === "" ? null : Number(targetRoi),
      settlementBrl: calculated.settlementBrl,
      netProfitCny: calculated.netProfitCny,
      roi: calculated.roi,
      breakEvenRoi: calculated.breakEvenRoi,
      expectedProfitCny: calculated.expectedProfitCny,
    };

    const res = await fetch("/api/profit-calculations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      toast.error("保存失败");
      return;
    }

    await mutate("/api/profit-calculations");
    toast.success("测算已保存");
  };

  const removeHistory = async (id: string) => {
    const res = await fetch(`/api/profit-calculations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("删除失败");
      return;
    }
    await mutate("/api/profit-calculations");
    toast.success("已删除");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 space-y-6">
      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-r from-slate-900/90 to-slate-800/60 p-5 shadow-xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-300 mb-1">
              <Calculator size={16} />
              <span className="text-xs tracking-[0.2em] uppercase">Ops Profit Tool</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">利润测算中心</h1>
            <p className="text-sm text-slate-400 mt-1">商品联动、实时利润测算、ROI 推演与历史存档</p>
          </div>
          {warning && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 flex items-center gap-2">
              <CircleAlert size={14} />
              风险预警中
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-5 space-y-5 shadow-xl backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={labelClassName}>
              商品选择
              <select value={productId} onChange={(e) => onSelectProduct(e.target.value)} className={inputClassName}>
                <option value="">请选择商品</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.skuId})
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClassName}>
              商品名称
              <input value={productName} onChange={(e) => setProductName(e.target.value)} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              采购成本(CNY/件)
              <input type="number" value={purchaseCostCny} onChange={(e) => setPurchaseCostCny(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              重量(kg，可选)
              <input type="number" value={weightKg} onChange={(e) => setWeightKg(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              头程物流费(CNY/件)
              <input type="number" value={firstLegShippingCny} onChange={(e) => setFirstLegShippingCny(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              广告分摊(CNY/件)
              <input type="number" value={adCostCny} onChange={(e) => setAdCostCny(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              财务开票费用（结算额 CNY × 比例，默认 6%）
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={invoiceFeePercentManual}
                  onChange={(e) => setInvoiceFeePercentManual(e.target.value === "" ? "" : Number(e.target.value))}
                  className={`${inputClassName} flex-1 mt-0`}
                  placeholder="留空按 6%"
                />
                <span className="shrink-0 text-sm text-slate-400 pb-0.5">%</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                当前按结算额 × <span className="text-cyan-400/90">{calculated.invoiceFeePercentUsed}%</span>
                ，折合{" "}
                <span className="text-cyan-400/90">{money(calculated.invoiceFeePerPieceCny)}</span> /件，合计{" "}
                {money(calculated.invoiceFeeTotalCny)} CNY
                {invoiceFeePercentManual === "" ? "（未填比例，按 6%）" : "（自定义比例）"}
              </div>
            </label>
            <label className={labelClassName}>
              回款三方平台手续费（结算额 CNY × 比例，默认 1%）
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={remittanceFeePercentManual}
                  onChange={(e) => setRemittanceFeePercentManual(e.target.value === "" ? "" : Number(e.target.value))}
                  className={`${inputClassName} flex-1 mt-0`}
                  placeholder="留空按 1%"
                />
                <span className="shrink-0 text-sm text-slate-400 pb-0.5">%</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                当前按结算额 × <span className="text-cyan-400/90">{calculated.remittanceFeePercentUsed}%</span>
                ，折合{" "}
                <span className="text-cyan-400/90">{money(calculated.remittanceFeePerPieceCny)}</span> /件，合计{" "}
                {money(calculated.remittanceFeeTotalCny)} CNY
                {remittanceFeePercentManual === "" ? "（未填比例，按 1%）" : "（自定义比例）"}
              </div>
            </label>
            <label className={labelClassName}>
              售价(BRL)
              <input type="number" value={salePriceBrl} onChange={(e) => setSalePriceBrl(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              商品折扣价(BRL)
              <input
                type="number"
                value={discountSalePriceBrl}
                onChange={(e) => setDiscountSalePriceBrl(e.target.value === "" ? "" : Number(e.target.value))}
                className={inputClassName}
                placeholder="不填则按原售价计算"
              />
            </label>
            <label className={labelClassName}>
              汇率(BRL→CNY)
              <input type="number" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              美元汇率(1 USD = ? CNY)
              <input
                type="number"
                value={usdManualRate}
                onChange={(e) => setUsdManualRate(e.target.value === "" ? "" : Number(e.target.value))}
                className={inputClassName}
                placeholder={`留空用系统 ${apiUsdRate.toFixed(4)}`}
              />
              <div className="mt-1 text-[11px] text-slate-500">
                当前生效：{usdRate.toFixed(4)} CNY/USD
                {usdManualRate !== "" && Number(usdManualRate) > 0 ? "（手动）" : "（系统/默认）"}
              </div>
            </label>
            <label className={labelClassName}>
              件数
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
            <label className={labelClassName}>
              目标 ROI
              <input type="number" value={targetRoi} onChange={(e) => setTargetRoi(e.target.value === "" ? "" : Number(e.target.value))} className={inputClassName} />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/70 p-3">
              <div className="text-xs text-slate-400 mb-2">发货模式（SFP可叠加海外仓费用）</div>
              <div className="flex gap-2">
                <button onClick={() => setShippingMode("SFP")} className={`px-3 py-2 rounded-md text-sm transition-all ${shippingMode === "SFP" ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>SFP自发货</button>
                <button onClick={() => setShippingMode("WAREHOUSE_3PL")} className={`px-3 py-2 rounded-md text-sm transition-all ${shippingMode === "WAREHOUSE_3PL" ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>3PL海外仓</button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/70 p-3">
              <div className="text-xs text-slate-400 mb-2">免佣任务状态</div>
              <div className="flex gap-2">
                <button onClick={() => setIsCommissionFree(true)} className={`px-3 py-2 rounded-md text-sm transition-all ${isCommissionFree ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>有效</button>
                <button onClick={() => setIsCommissionFree(false)} className={`px-3 py-2 rounded-md text-sm transition-all ${!isCommissionFree ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>无效</button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                有效=仅收6%物流佣金；无效=6%物流佣金+6%平台佣金+4 BRL/件
              </div>
            </div>
            <label className={labelClassName}>
              海外仓操作费(BRL，按汇率折算CNY)
              <div className={`${inputClassName} flex items-center justify-between`}>
                <span className="text-slate-300">自动计算</span>
                <div className="text-right leading-tight">
                  <div className="font-semibold text-cyan-300">{money(calculated.warehouseFee)} BRL</div>
                  <div className="text-[11px] text-emerald-300">{money(calculated.warehouseFeeCny)} CNY</div>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                基础费 {money(calculated.warehouseBaseFeePerOrder)}
                {calculated.warehouseExtraByQty > 0 ? ` + 加件费 ${money(calculated.warehouseExtraByQty)}` : ""}
                ，折算CNY {money(calculated.warehouseFeeCny)}
              </div>
            </label>
          </div>

          <button onClick={saveCalculation} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 text-white font-medium shadow-lg shadow-cyan-500/20 hover:from-cyan-600 hover:to-blue-700 transition-all">
            <Save size={16} />
            保存测算
          </button>
        </div>

        <div className={`rounded-xl border p-5 space-y-4 shadow-xl ${warning ? "border-rose-500/60 bg-gradient-to-br from-rose-950/30 to-slate-900/70" : "border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40"}`}>
          <div className="text-slate-100 font-semibold flex items-center gap-2">
            <Gem size={16} className="text-violet-300" />
            测算仪表盘
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-3">
            <div className="text-xs text-slate-400">结算额(BRL)</div>
            <div className="text-xl font-bold text-cyan-300">{money(calculated.settlementBrl)} BRL</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{money(calculated.settlementBrl * Number(exchangeRate || 0))} CNY</div>
            <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              计算：售价 {money(calculated.effectiveSale)} × {calculated.qty} - SFP物流佣金(必扣) {money(calculated.sfpCommission)} - 平台额外费 {money(calculated.extraPlatformFee)}
              {!isCommissionFree && (
                <span>
                  （平台额外费率 {money(calculated.extraPlatformRateFee)} + 固定费 {money(calculated.extraPlatformFixedFee)}）
                </span>
              )}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-3">
            <div className="text-xs text-slate-400">净利润(BRL)</div>
            <div className={`text-xl font-bold ${calculated.netProfitCny < 0 ? "text-rose-400" : "text-emerald-300"}`}>{money(calculated.netProfitBrl)} BRL</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{money(calculated.netProfitCny)} CNY</div>
            <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              计算：结算额折算 {money(calculated.settlementCny)} - 基础成本(含广告/开票/回款三方平台手续费) {money(calculated.totalCostCny)} - 海外仓费折算 {money(calculated.warehouseFeeCny)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-3">
            <div className="text-xs text-slate-400">利润率(%)</div>
            <div className="text-xl font-bold text-slate-100">{calculated.profitRate.toFixed(2)}%</div>
            {calculated.profitRate > 20 && <span className="inline-flex items-center gap-1 mt-2 text-xs rounded-full px-2 py-0.5 bg-emerald-500/20 text-emerald-300"><Package size={12} />优选</span>}
            <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              计算：净利润 {money(calculated.netProfitCny)} / 营业额 {money(calculated.grossRevenueCny)} × 100
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-3">
              <div className="text-xs text-slate-400">保本 ROI</div>
              <div className="text-slate-100 font-semibold">{calculated.breakEvenRoi.toFixed(4)}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                计算：营业额 {money(calculated.grossRevenueCny)} / 净利润 {money(calculated.netProfitCny)}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-amber-300">
                保本ROI对应的广告消耗金额：{usdMoney(calculated.breakEvenAdCostCny, usdRate)} USD
              </div>
              <div className="text-[11px] text-slate-500">{money(calculated.breakEvenAdCostCny)} CNY</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="min-w-0 rounded-lg bg-slate-950/70 border border-slate-800/80 p-3">
              <div className="text-xs text-slate-400">目标 ROI 预期利润(BRL)</div>
              <div className="text-xl font-bold text-violet-300 break-words">
                {calculated.expectedProfitBrl == null ? "-" : `${money(calculated.expectedProfitBrl)} BRL`}
              </div>
              {calculated.expectedProfitCny != null && <div className="mt-1 text-[11px] text-slate-500">{money(calculated.expectedProfitCny)} CNY</div>}
              {calculated.expectedProfitCny != null && (
                <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500 break-words">
                  计算：净利润 {money(calculated.netProfitCny)} - 目标ROI对应金额 {money(calculated.targetAdBudgetCny)}
                </div>
              )}
              {calculated.expectedProfitCny == null && <div className="mt-1 text-[11px] text-slate-500">请先填写目标 ROI</div>}
            </div>
            <div className="min-w-0 rounded-lg bg-slate-950/70 border border-slate-800/80 p-3">
              <div className="text-xs text-slate-400">目标 ROI 对应金额(USD)</div>
              <div className="text-xl font-bold text-amber-300 break-words">
                {calculated.targetAdBudgetCny == null ? "-" : `${usdMoney(calculated.targetAdBudgetCny, usdRate)} USD`}
              </div>
              {calculated.targetAdBudgetCny != null && (
                <>
                  <div className="mt-1 text-[11px] text-slate-500">{money(calculated.targetAdBudgetCny)} CNY</div>
                  <div className="text-[11px] text-slate-500">{money(calculated.targetAdBudgetCny / Number(exchangeRate || 1))} BRL</div>
                  <div className="mt-1.5 text-[11px] leading-relaxed text-slate-500 break-words">
                    计算：营业额 {money(calculated.grossRevenueCny)} / 目标ROI {Number(targetRoi)}
                  </div>
                </>
              )}
              {calculated.targetAdBudgetCny == null && <div className="mt-1 text-[11px] text-slate-500">请先填写有效目标 ROI</div>}
              <div className="mt-1 text-[11px] text-slate-500 break-words">
                USD 换算按 1 USD = {usdRate.toFixed(4)} CNY
                {usdManualRate !== "" && Number(usdManualRate) > 0 ? "（手动）" : "（系统/默认）"}
              </div>
            </div>
          </div>
          {warning && <div className="text-xs text-rose-300">预警：净利润为负或 ROI 低于保本 ROI。</div>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/50 bg-gradient-to-br from-slate-900/80 to-slate-800/40 p-5 shadow-xl backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">测算历史</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800/80">
                <th className="text-left py-2">商品</th>
                <th className="text-left py-2">SKU</th>
                <th className="text-left py-2">营业额(BRL)</th>
                <th className="text-left py-2">结算额(BRL)</th>
                <th className="text-left py-2">净利润(BRL/CNY)</th>
                <th className="text-left py-2">免佣任务状态</th>
                <th className="text-left py-2">保本ROI</th>
                <th className="text-left py-2">时间</th>
                <th className="text-right py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b border-slate-800/50 text-slate-200 hover:bg-slate-800/30 transition-all">
                  <td className="py-2">{row.productName}</td>
                  <td>{row.skuId || "-"}</td>
                  <td>{money(row.grossRevenueBrl)}</td>
                  <td>{money(row.settlementBrl)}</td>
                  <td className={row.netProfitCny < 0 ? "text-rose-400" : "text-emerald-300"}>
                    <div className="leading-tight">
                      <div className="font-medium">
                        {money(
                          row.exchangeRate > 0 ? num(row.netProfitCny) / num(row.exchangeRate) : 0
                        )}{" "}
                        BRL
                      </div>
                      <div className="text-[11px] text-slate-500 font-normal">{money(row.netProfitCny)} CNY</div>
                    </div>
                  </td>
                  <td className={row.isCommissionFree ? "text-emerald-300" : "text-rose-300"}>{row.isCommissionFree ? "有效" : "无效"}</td>
                  <td>{row.breakEvenRoi.toFixed(4)}</td>
                  <td>{new Date(row.createdAt).toLocaleString("zh-CN")}</td>
                  <td className="text-right">
                    <button onClick={() => removeHistory(row.id)} className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors">
                      <Trash2 size={14} />
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
