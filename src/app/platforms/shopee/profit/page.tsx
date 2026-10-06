"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Store,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line as ChartLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Pagination } from "@/components/Pagination";
import { formatOrderDateTime } from "@/lib/order-business-time";

type GroupBy = "day" | "week" | "month";
type DetailTab = "period" | "store" | "sku" | "orders" | "coverage";
type CurrencyAmounts = Record<string, number>;
type AggregateOriginalAmounts = {
  gmv: CurrencyAmounts;
  platformFees: CurrencyAmounts;
  commissionFee: CurrencyAmounts;
  serviceFee: CurrencyAmounts;
  affiliateCommission: CurrencyAmounts;
  tax: CurrencyAmounts;
  advertising: CurrencyAmounts;
  shipping: CurrencyAmounts;
  refund: CurrencyAmounts;
  productCost: CurrencyAmounts;
  firstMileLogistics: CurrencyAmounts;
  warehouse: CurrencyAmounts;
};
type Line = {
  itemId: string;
  modelId: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  internalQuantity: number;
  lineValueOriginal: number;
  gmvCny: number;
  lineCostCny: number;
  firstMileLogisticsCny: number;
  firstMileOriginalAmounts: CurrencyAmounts;
  mapped: boolean;
  firstMileCovered: boolean;
};
type ProfitRow = {
  orderId: string;
  shopId: string;
  shopName: string;
  countryCode: string;
  storeId: string | null;
  status: string;
  createTime: string | null;
  businessDate: string | null;
  currency: string;
  paymentMethod: string | null;
  exchangeRate: number;
  units: number;
  internalUnits: number;
  gmvOriginal: number;
  gmvCny: number;
  gmvSource: string;
  platformFeesOriginal: number;
  platformFeesCny: number;
  commissionFeeOriginal: number;
  commissionFeeCny: number;
  serviceFeeOriginal: number;
  serviceFeeCny: number;
  affiliateCommissionOriginal: number;
  affiliateCommissionCny: number;
  officialPlatformFeesOriginal: number;
  platformFeesSource: string;
  taxRatePercent: number;
  taxCostOriginal: number;
  taxCostCny: number;
  taxStatus: string;
  advertisingOriginal: number;
  advertisingCurrency: string;
  advertisingCny: number;
  advertisingStatus: string;
  advertisingSettlementFundingOriginal: number;
  shippingOriginal: number;
  shippingCny: number;
  refundOriginal: number;
  refundCny: number;
  productCostCny: number;
  firstMileLogisticsCny: number;
  firstMileOriginalAmounts: CurrencyAmounts;
  firstMileStatus: string;
  warehouseCostOriginal: number;
  warehouseCurrency: string;
  warehouseCostCny: number;
  warehouseStatus: string;
  warehouseName?: string;
  warehouseFeeBreakdown?: {
    currency?: string | null;
    orderOutbound: number;
    packaging: number;
    oversize: number;
    total: number;
    chargeableWeightKg: number;
    volumetricWeightKg?: number;
    packageDimensions: [number, number, number];
    billedUnits: number;
    distinctSkuCount: number;
  };
  costsCny: number;
  profitCny: number;
  margin: number;
  settlementStatus: string;
  productCostStatus: string;
  coverage: string;
  includedInProfit: boolean;
  exclusionReason: string | null;
  lines: Line[];
};
type Aggregate = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  totalOrders: number;
  orders: number;
  cancelledOrders: number;
  unpaidOrders: number;
  units: number;
  internalUnits: number;
  gmvCny: number;
  platformFeesCny: number;
  commissionFeeCny: number;
  serviceFeeCny: number;
  advertisingCny: number;
  affiliateCommissionCny: number;
  shippingCny: number;
  refundCny: number;
  productCostCny: number;
  firstMileLogisticsCny: number;
  warehouseCostCny: number;
  taxCostCny: number;
  costsCny: number;
  profitCny: number;
  completeOrders: number;
  pendingAffiliateOrders: number;
  margin: number;
  completeness: number;
  originalAmounts: AggregateOriginalAmounts;
};
type StoreAggregate = Aggregate & {
  shopId: string;
  shopName: string;
  countryCode: string;
};
type SkuAggregate = {
  id: string;
  shopId: string;
  shopName: string;
  countryCode: string;
  sku: string;
  name: string;
  orders: number;
  units: number;
  gmvCny: number;
  productCostCny: number;
  firstMileLogisticsCny: number;
  otherCostsCny: number;
  costsCny: number;
  profitCny: number;
  margin: number;
};
type Shop = { shopId: string; shopName: string | null; region: string };
type Coverage = {
  overall: number;
  settlement: number;
  productCost: number;
  firstMile: number;
  advertising: number;
  warehouse: number;
  tax: number;
  settlementOrders: number;
  productCoveredUnits: number;
  firstMileCoveredUnits: number;
  advertisingCoveredOrders: number;
  warehouseCoveredOrders: number;
  taxCoveredOrders: number;
};
type ResponseData = {
  rows: ProfitRow[];
  shops: Shop[];
  countries: string[];
  summary: Aggregate & { partialOrders: number; incompleteOrders: number };
  periods: Aggregate[];
  stores: StoreAggregate[];
  skus: SkuAggregate[];
  coverage: Coverage;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: { startDate: string; endDate: string; groupBy: GroupBy };
  warnings: string[];
};

const controlClass =
  "h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-orange-400";

function money(value: number, currency = "CNY") {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function hasOfficialOrderIncome(status: string) {
  return status === "ACTUAL" || status === "ESTIMATED";
}

function orderIncomeStageLabel(status: string) {
  if (status === "ACTUAL") return "最终收入";
  if (status === "ESTIMATED") return "预计收入";
  return "待收入明细";
}

function orderIncomeAmountLabel(status: string, value: number, currency: string) {
  if (!hasOfficialOrderIncome(status)) return "待收入明细";
  return `${status === "ESTIMATED" ? "预计 " : ""}${money(value, currency)}`;
}

function affiliateCommissionAmountLabel(status: string, value: number, currency: string) {
  if (status !== "ACTUAL") return "待最终结算";
  return money(value, currency);
}

function originalMoney(currency: string, value: number) {
  try {
    return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
  }
}

function originalSummary(amounts: CurrencyAmounts | undefined) {
  return Object.entries(amounts || {})
    .filter(
      ([, amount]) => Number.isFinite(amount) && Math.abs(amount) > 0.000001,
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => originalMoney(currency, amount))
    .join(" + ");
}

function mergeOriginalAmounts(...sources: Array<CurrencyAmounts | undefined>) {
  const merged: CurrencyAmounts = {};
  for (const source of sources) {
    for (const [currency, amount] of Object.entries(source || {}))
      merged[currency] = (merged[currency] || 0) + amount;
  }
  return merged;
}

function originalAverage(amounts: CurrencyAmounts | undefined, orders: number) {
  if (orders <= 0) return "-";
  return (
    originalSummary(
      Object.fromEntries(
        Object.entries(amounts || {}).map(([currency, amount]) => [
          currency,
          amount / orders,
        ]),
      ),
    ) || "-"
  );
}

function percent(value: number, total: number) {
  return total > 0 ? `${((value / total) * 100).toFixed(2)}%` : "0.00%";
}
function offsetDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function normalizedCountry(value: string) {
  const code = value.trim().toUpperCase();
  if (["BR", "BRA", "BRAZIL", "巴西"].includes(code)) return "BR";
  if (["US", "USA", "UNITED STATES", "美国"].includes(code)) return "US";
  return code;
}
function periodLabel(row: Aggregate, groupBy: GroupBy) {
  if (groupBy === "month")
    return `${row.startDate.slice(0, 7).replace("-", "年")}月`;
  if (groupBy === "week")
    return `${row.startDate.slice(5).replace("-", "月")}日 - ${row.endDate.slice(5).replace("-", "月")}日`;
  return `${row.startDate.slice(5, 7)}月${row.startDate.slice(8, 10)}日`;
}

export default function ShopeeProfitPage() {
  const router = useRouter();
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [countryCode, setCountryCode] = useState("");
  const [shopId, setShopId] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState(() => offsetDate(-89));
  const [endDate, setEndDate] = useState(() => offsetDate(0));
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<DetailTab>("period");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Aggregate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        groupBy,
        startDate,
        endDate,
      });
      if (countryCode) params.set("countryCode", countryCode);
      if (shopId) params.set("shopId", shopId);
      if (status) params.set("status", status);
      if (keyword) params.set("keyword", keyword);
      const response = await fetch(`/api/shopee/profit?${params.toString()}`, {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body?.error || "Shopee 精细利润加载失败");
      setData(body);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Shopee 精细利润加载失败",
      );
    } finally {
      setLoading(false);
    }
  }, [
    countryCode,
    endDate,
    groupBy,
    keyword,
    page,
    pageSize,
    shopId,
    startDate,
    status,
  ]);

  useEffect(() => {
    void load();
  }, [load]);
  const filteredShops = useMemo(
    () =>
      (data?.shops || []).filter(
        (shop) =>
          !countryCode || normalizedCountry(shop.region) === countryCode,
      ),
    [countryCode, data?.shops],
  );
  const summary = data?.summary;
  const costRows = [
    [
      "平台佣金 Commission Fee（净额）",
      summary?.commissionFeeCny || 0,
      "bg-blue-500",
    ],
    [
      "平台服务费 Service Fee（净额）",
      summary?.serviceFeeCny || 0,
      "bg-indigo-500",
    ],
    [
      "联盟达人佣金 AMS Commission Fee",
      summary?.affiliateCommissionCny || 0,
      "bg-fuchsia-500",
    ],
    ["店铺主体税务成本", summary?.taxCostCny || 0, "bg-rose-500"],
    ["采购成本", summary?.productCostCny || 0, "bg-amber-500"],
    ["头程物流费用", summary?.firstMileLogisticsCny || 0, "bg-cyan-500"],
    [
      "尾程物流 / 退款",
      (summary?.shippingCny || 0) + (summary?.refundCny || 0),
      "bg-teal-500",
    ],
    ["海外仓代发", summary?.warehouseCostCny || 0, "bg-emerald-500"],
    ["广告费用", summary?.advertisingCny || 0, "bg-violet-500"],
  ] as const;
  const setPreset = (days: number) => {
    setStartDate(offsetDate(-(days - 1)));
    setEndDate(offsetDate(0));
    setPage(1);
  };

  return (
    <div className="min-h-screen space-y-5 bg-slate-950 p-4 text-slate-100 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CircleDollarSign className="h-6 w-6 text-orange-400" />
            Shopee 精细利润核算
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            按目的国时间汇总 Shopee 订单，页面结构与 TikTok
            精细利润核算保持一致。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-4 text-sm hover:border-orange-400 disabled:opacity-50"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          刷新
        </button>
      </header>

      <section className="space-y-4 border-y border-slate-800 py-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[auto_auto_repeat(6,minmax(0,1fr))] xl:items-end">
          <div>
            <span className="mb-2 block text-xs text-slate-400">报表周期</span>
            <div className="inline-flex h-10 rounded-md border border-slate-700 bg-slate-900 p-0.5">
              {(["day", "week", "month"] as GroupBy[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setGroupBy(value);
                    setPage(1);
                  }}
                  className={`min-w-14 rounded px-3 text-sm ${groupBy === value ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                >
                  {value === "day"
                    ? "日报"
                    : value === "week"
                      ? "周报"
                      : "月报"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-2 block text-xs text-slate-400">快捷范围</span>
            <div className="flex h-10 gap-1">
              {[7, 30, 90].map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPreset(days)}
                  className="rounded-md border border-slate-700 px-3 text-sm text-slate-300 hover:bg-slate-800"
                >
                  {days} 天
                </button>
              ))}
            </div>
          </div>
          <Filter label="平台">
            <select
              value="SHOPEE"
              onChange={(event) => {
                if (event.target.value === "TIKTOK")
                  router.push("/finance/profit");
              }}
              className={`${controlClass} border-orange-500/50 text-orange-200`}
            >
              <option value="TIKTOK">TikTok Shop</option>
              <option value="SHOPEE">Shopee</option>
              <option disabled>Amazon（待接入）</option>
              <option disabled>Mercado Livre（待接入）</option>
            </select>
          </Filter>
          <Filter label="国家">
            <select
              value={countryCode}
              onChange={(event) => {
                setCountryCode(event.target.value);
                setShopId("");
                setPage(1);
              }}
              className={controlClass}
            >
              <option value="">全部国家</option>
              {(data?.countries || []).map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="店铺">
            <select
              value={shopId}
              onChange={(event) => {
                setShopId(event.target.value);
                setPage(1);
              }}
              className={controlClass}
            >
              <option value="">全部店铺</option>
              {filteredShops.map((shop) => (
                <option key={shop.shopId} value={shop.shopId}>
                  {shop.shopName || shop.shopId}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="订单状态">
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className={controlClass}
            >
              <option value="">全部状态</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="SHIPPED">SHIPPED</option>
              <option value="READY_TO_SHIP">READY_TO_SHIP</option>
              <option value="PROCESSED">PROCESSED</option>
              <option value="UNPAID">UNPAID</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </Filter>
          <Filter label="开始日期">
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
              className={controlClass}
            />
          </Filter>
          <Filter label="结束日期">
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
              className={controlClass}
            />
          </Filter>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setKeyword(keywordInput.trim());
              setPage(1);
            }}
            className="self-end flex"
          >
            <input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="订单号或买家"
              className="h-10 min-w-0 flex-1 rounded-l-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus:border-orange-400"
            />
            <button
              type="submit"
              title="搜索"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-md bg-slate-700 hover:bg-slate-600"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>

      {(data?.warnings || []).map((warning) => (
        <div
          key={warning}
          className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {warning}
        </div>
      ))}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Metric
          label="GMV"
          value={money(summary?.gmvCny || 0)}
          detail={`${summary?.orders || 0} 销售单 / ${summary?.units || 0} 件 · 取消 ${summary?.cancelledOrders || 0}`}
        />
        <Metric
          label="平台佣金 Commission Fee"
          value={money(summary?.commissionFeeCny || 0)}
          detail={`订单官方结算净额 · 占 GMV ${percent(summary?.commissionFeeCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="平台服务费 Service Fee"
          value={money(summary?.serviceFeeCny || 0)}
          detail={`订单官方结算净额 · 占 GMV ${percent(summary?.serviceFeeCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="联盟达人佣金 AMS Commission Fee"
          value={(summary?.pendingAffiliateOrders || 0) > 0 && !(summary?.affiliateCommissionCny || 0)
            ? "待结算"
            : money(summary?.affiliateCommissionCny || 0)}
          detail={`最终结算已入账 · ${(summary?.pendingAffiliateOrders || 0)} 笔待结算 · 占 GMV ${percent(summary?.affiliateCommissionCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="店铺主体税务成本"
          value={money(summary?.taxCostCny || 0)}
          detail={`按店铺生效税率 · 占 GMV ${percent(summary?.taxCostCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="采购成本"
          value={money(summary?.productCostCny || 0)}
          detail={`占 GMV ${percent(summary?.productCostCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="头程物流费用"
          value={money(summary?.firstMileLogisticsCny || 0)}
          detail={`占 GMV ${percent(summary?.firstMileLogisticsCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="尾程物流 / 退款"
          value={money((summary?.shippingCny || 0) + (summary?.refundCny || 0))}
          detail={`占 GMV ${percent((summary?.shippingCny || 0) + (summary?.refundCny || 0), summary?.gmvCny || 0)}`}
        />
        <Metric
          label="海外仓代发"
          value={money(summary?.warehouseCostCny || 0)}
          detail={`占 GMV ${percent(summary?.warehouseCostCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="广告费用"
          value={money(summary?.advertisingCny || 0)}
          detail={`官方消耗 · 占 GMV ${percent(summary?.advertisingCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="总成本"
          value={money(summary?.costsCny || 0)}
          detail={`占 GMV ${percent(summary?.costsCny || 0, summary?.gmvCny || 0)}`}
        />
        <Metric
          label="贡献利润"
          value={money(summary?.profitCny || 0)}
          detail={`利润率 ${(summary?.margin || 0).toFixed(2)}%`}
          tone={
            (summary?.profitCny || 0) >= 0
              ? "text-emerald-300"
              : "text-rose-300"
          }
        />
        <Metric
          label="核算完整度"
          value={`${(data?.coverage.overall || 0).toFixed(2)}%`}
          detail={`${summary?.completeOrders || 0} / ${summary?.orders || 0} 单完整`}
          tone="text-emerald-300"
        />
      </section>

      <section className="grid gap-5 border-y border-slate-800 py-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">利润趋势</h2>
            <span className="text-xs text-slate-500">GMV / 贡献利润</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data?.periods || []}>
                <CartesianGrid
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="startDate"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={(value) => String(value).slice(5)}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={(value) =>
                    `¥${(Number(value) / 10000).toFixed(1)}w`
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 6,
                  }}
                  formatter={(value) => money(Number(value))}
                />
                <Bar
                  dataKey="gmvCny"
                  name="GMV"
                  fill="#f97316"
                  radius={[2, 2, 0, 0]}
                />
                <ChartLine
                  dataKey="profitCny"
                  name="贡献利润"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="border-slate-800 xl:border-l xl:pl-5">
          <h2 className="mb-4 text-sm font-semibold">成本结构</h2>
          <div className="space-y-4">
            {costRows.map(([label, value, color]) => (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {money(value)}{" "}
                    <small className="ml-1 text-slate-500">
                      {percent(value, summary?.gmvCny || 0)}
                    </small>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-800">
                  <div
                    className={`h-full ${color}`}
                    style={{
                      width: `${Math.min(100, summary?.gmvCny ? (value / summary.gmvCny) * 100 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap gap-1 border-b border-slate-800 pb-3">
          {(
            [
              [
                "period",
                groupBy === "day"
                  ? "日报明细"
                  : groupBy === "week"
                    ? "周报明细"
                    : "月报明细",
              ],
              ["store", "店铺利润"],
              ["sku", "SKU 利润"],
              ["orders", "订单明细"],
              ["coverage", "数据完整度"],
            ] as Array<[DetailTab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`h-9 rounded-md px-3 text-sm ${tab === value ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && !data ? (
          <div className="flex h-60 items-center justify-center text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-400" />
            正在计算 Shopee 订单利润...
          </div>
        ) : null}
        {tab === "period" && (
          <AggregateTable
            rows={data?.periods || []}
            groupBy={groupBy}
            onOpen={setSelectedPeriod}
          />
        )}
        {tab === "store" && <StoreTable rows={data?.stores || []} />}
        {tab === "sku" && <SkuTable rows={data?.skus || []} />}
        {tab === "orders" && (
          <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
            <OrderTable
              rows={data?.rows || []}
              loading={loading}
              expanded={expanded}
              onToggle={(orderId) =>
                setExpanded(expanded === orderId ? null : orderId)
              }
            />
            {data?.pagination && (
              <Pagination
                total={data.pagination.total}
                page={data.pagination.page}
                pageSize={data.pagination.pageSize}
                onPageChange={(value) => {
                  setPage(value);
                  setExpanded(null);
                }}
                onPageSizeChange={(value) => {
                  setPageSize(value);
                  setPage(1);
                }}
                showAllOption={false}
              />
            )}
          </div>
        )}
        {tab === "coverage" && (
          <CoveragePanel coverage={data?.coverage} summary={summary} />
        )}
      </section>

      {selectedPeriod && (
        <PeriodOrdersDialog
          period={selectedPeriod}
          countryCode={countryCode}
          shopId={shopId}
          status={status}
          onClose={() => setSelectedPeriod(null)}
        />
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-0 text-xs text-slate-400">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
function Metric({
  label,
  value,
  detail,
  tone = "text-slate-100",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div
        className={`mt-1 truncate text-xl font-semibold tabular-nums ${tone}`}
        title={value}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-slate-500" title={detail}>
        {detail}
      </div>
    </div>
  );
}

function AggregateTable({
  rows,
  groupBy,
  onOpen,
}: {
  rows: Aggregate[];
  groupBy: GroupBy;
  onOpen: (row: Aggregate) => void;
}) {
  return (
    <TableFrame empty={rows.length === 0}>
      <table className="w-full min-w-[2280px] text-sm">
        <thead className="bg-slate-900 text-xs text-slate-400">
          <tr>
            <th className="px-3 py-3 text-left font-medium">周期</th>
            <th className="px-3 py-3 text-right font-medium">
              订单 / 销售件 / 实物件 / 平均客单价
            </th>
            <th className="px-3 py-3 text-right font-medium">GMV</th>
            <th className="px-3 py-3 text-right font-medium">平台佣金</th>
            <th className="px-3 py-3 text-right font-medium">平台服务费</th>
            <th className="px-3 py-3 text-right font-medium">联盟达人佣金</th>
            <th className="px-3 py-3 text-right font-medium">主体税务成本</th>
            <th className="px-3 py-3 text-right font-medium">广告费用</th>
            <th className="px-3 py-3 text-right font-medium">采购成本</th>
            <th className="px-3 py-3 text-right font-medium">头程物流费用</th>
            <th className="px-3 py-3 text-right font-medium">尾程 / 退款</th>
            <th className="px-3 py-3 text-right font-medium">仓库费用</th>
            <th className="px-3 py-3 text-right font-medium">贡献利润</th>
            <th className="px-3 py-3 text-right font-medium">利润率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {[...rows].reverse().map((row) => (
            <tr
              key={row.id}
              className="cursor-pointer hover:bg-slate-900/70"
              onClick={() => onOpen(row)}
            >
              <td className="px-3 py-3 text-left">
                <div className="flex items-center gap-2 font-medium">
                  <ChevronRight className="h-4 w-4 text-slate-500" />
                  {periodLabel(row, groupBy)}
                </div>
                <div className="mt-1 pl-6 text-[11px] text-slate-500">
                  取消 {row.cancelledOrders} · 未付款 {row.unpaidOrders} ·
                  点击查看明细
                </div>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                <div>
                  {row.orders.toLocaleString()} / {row.units.toLocaleString()} /{" "}
                  {(row.internalUnits ?? row.units).toLocaleString()}
                </div>
                <div className="mt-0.5 whitespace-nowrap text-[11px] font-normal text-slate-500">
                  平均客单价{" "}
                  {originalAverage(row.originalAmounts?.gmv, row.orders)}
                </div>
              </td>
              <AggregateMoneyCell
                value={row.gmvCny}
                original={row.originalAmounts?.gmv}
                gmvCny={row.gmvCny}
              />
              <AggregateMoneyCell
                value={row.commissionFeeCny}
                original={row.originalAmounts?.commissionFee}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.serviceFeeCny}
                original={row.originalAmounts?.serviceFee}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.affiliateCommissionCny}
                original={row.originalAmounts?.affiliateCommission}
                gmvCny={row.gmvCny}
                showShare
                pendingCount={row.pendingAffiliateOrders}
              />
              <AggregateMoneyCell
                value={row.taxCostCny}
                original={row.originalAmounts?.tax}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.advertisingCny}
                original={row.originalAmounts?.advertising}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.productCostCny}
                original={row.originalAmounts?.productCost}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.firstMileLogisticsCny}
                original={row.originalAmounts?.firstMileLogistics}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.shippingCny + row.refundCny}
                original={mergeOriginalAmounts(
                  row.originalAmounts?.shipping,
                  row.originalAmounts?.refund,
                )}
                gmvCny={row.gmvCny}
                showShare
              />
              <AggregateMoneyCell
                value={row.warehouseCostCny}
                original={row.originalAmounts?.warehouse}
                gmvCny={row.gmvCny}
                showShare
              />
              <td
                className={`px-3 py-3 text-right tabular-nums ${row.profitCny >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}`}
              >
                <div>{money(row.profitCny)}</div>
                <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                  利润率 {row.margin.toFixed(2)}%
                </div>
              </td>
              <td
                className={`px-3 py-3 text-right tabular-nums ${row.margin >= 0 ? "text-emerald-300" : "text-rose-300"}`}
              >
                {row.margin.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function AggregateMoneyCell({
  value,
  original,
  gmvCny,
  showShare = false,
  pendingCount = 0,
}: {
  value: number;
  original?: CurrencyAmounts;
  gmvCny: number;
  showShare?: boolean;
  pendingCount?: number;
}) {
  const sourceAmount = originalSummary(original);
  const entirelyPending = pendingCount > 0 && Math.abs(value) < 0.005;
  return (
    <td className="px-3 py-3 text-right tabular-nums">
      <div className={entirelyPending ? "text-amber-300" : "text-slate-200"}>
        {entirelyPending ? "待结算" : money(value)}
      </div>
      {pendingCount > 0 && (
        <div className="mt-0.5 whitespace-nowrap text-[11px] font-normal text-amber-400/80">
          {pendingCount} 笔达人佣金待结算
        </div>
      )}
      {sourceAmount && (
        <div
          className="mt-0.5 whitespace-nowrap text-[11px] font-normal text-slate-500"
          title="来源系统原币金额"
        >
          {sourceAmount}
        </div>
      )}
      {showShare && !entirelyPending && (
        <div className="mt-0.5 whitespace-nowrap text-[11px] font-normal text-slate-500">
          占 GMV {percent(value, gmvCny)}
        </div>
      )}
    </td>
  );
}

function StoreTable({ rows }: { rows: StoreAggregate[] }) {
  return (
    <TableFrame empty={rows.length === 0}>
      <table className="w-full min-w-[1860px] text-left text-sm">
        <thead className="bg-slate-900 text-xs text-slate-400">
          <tr>
            <th className="px-3 py-3">店铺 / 国家</th>
            <th className="px-3 py-3">订单 / 件数</th>
            <th className="px-3 py-3">GMV</th>
            <th className="px-3 py-3">平台佣金</th>
            <th className="px-3 py-3">平台服务费</th>
            <th className="px-3 py-3">联盟达人佣金</th>
            <th className="px-3 py-3">主体税务成本</th>
            <th className="px-3 py-3">广告费用</th>
            <th className="px-3 py-3">采购成本</th>
            <th className="px-3 py-3">头程物流</th>
            <th className="px-3 py-3">尾程 / 退款</th>
            <th className="px-3 py-3">仓库费用</th>
            <th className="px-3 py-3">贡献利润</th>
            <th className="px-3 py-3">利润率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.shopId} className="hover:bg-slate-900/70">
              <td className="px-3 py-3">
                <div>{row.shopName}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {row.countryCode}
                </div>
              </td>
              <td className="px-3 py-3">
                {row.orders} / {row.units}
              </td>
              <MoneyCell value={row.gmvCny} />
              <MoneyCell value={row.commissionFeeCny} />
              <MoneyCell value={row.serviceFeeCny} />
              <AggregateMoneyCell
                value={row.affiliateCommissionCny}
                original={row.originalAmounts?.affiliateCommission}
                gmvCny={row.gmvCny}
                pendingCount={row.pendingAffiliateOrders}
              />
              <MoneyCell value={row.taxCostCny} />
              <MoneyCell value={row.advertisingCny} />
              <MoneyCell value={row.productCostCny} />
              <MoneyCell value={row.firstMileLogisticsCny} />
              <MoneyCell value={row.shippingCny + row.refundCny} />
              <MoneyCell value={row.warehouseCostCny} />
              <MoneyCell value={row.profitCny} profit />
              <td
                className={
                  row.margin >= 0
                    ? "px-3 py-3 text-emerald-300"
                    : "px-3 py-3 text-rose-300"
                }
              >
                {row.margin.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function SkuTable({ rows }: { rows: SkuAggregate[] }) {
  return (
    <TableFrame empty={rows.length === 0}>
      <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-slate-900 text-xs text-slate-400">
          <tr>
            <th className="px-3 py-3">SKU / 商品</th>
            <th className="px-3 py-3">店铺</th>
            <th className="px-3 py-3">订单 / 件数</th>
            <th className="px-3 py-3">GMV</th>
            <th className="px-3 py-3">采购成本</th>
            <th className="px-3 py-3">头程物流</th>
            <th className="px-3 py-3">其他成本</th>
            <th className="px-3 py-3">贡献利润</th>
            <th className="px-3 py-3">利润率</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-900/70">
              <td className="max-w-[360px] px-3 py-3">
                <div className="font-mono text-xs">{row.sku}</div>
                <div
                  className="mt-1 truncate text-xs text-slate-500"
                  title={row.name}
                >
                  {row.name}
                </div>
              </td>
              <td className="px-3 py-3">
                <div>{row.shopName}</div>
                <div className="text-xs text-slate-500">{row.countryCode}</div>
              </td>
              <td className="px-3 py-3">
                {row.orders} / {row.units}
              </td>
              <MoneyCell value={row.gmvCny} />
              <MoneyCell value={row.productCostCny} />
              <MoneyCell value={row.firstMileLogisticsCny} />
              <MoneyCell value={row.otherCostsCny} />
              <MoneyCell value={row.profitCny} profit />
              <td
                className={
                  row.margin >= 0
                    ? "px-3 py-3 text-emerald-300"
                    : "px-3 py-3 text-rose-300"
                }
              >
                {row.margin.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}

function MoneyCell({
  value,
  profit = false,
}: {
  value: number;
  profit?: boolean;
}) {
  return (
    <td
      className={`px-3 py-3 tabular-nums ${profit ? (value >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-rose-300") : ""}`}
    >
      {money(value)}
    </td>
  );
}
function TableFrame({
  children,
  empty,
}: {
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-800 bg-slate-950">
      {empty ? (
        <div className="flex h-48 items-center justify-center text-sm text-slate-500">
          暂无匹配数据
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function OrderTable({
  rows,
  loading,
  expanded,
  onToggle,
}: {
  rows: ProfitRow[];
  loading: boolean;
  expanded: string | null;
  onToggle: (orderId: string) => void;
}) {
  if (loading)
    return (
      <div className="flex h-60 items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-400" />
        正在计算订单利润...
      </div>
    );
  if (!rows.length)
    return (
      <div className="flex h-60 flex-col items-center justify-center text-slate-500">
        <Store className="mb-3 h-8 w-8" />
        暂无 Shopee 订单
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[2250px] text-left text-sm">
        <thead className="bg-slate-800/80 text-xs text-slate-400">
          <tr>
            <th className="w-10 px-3 py-3" />
            <th className="px-3 py-3">订单 / 店铺</th>
            <th className="px-3 py-3">状态</th>
            <th className="px-3 py-3">GMV</th>
            <th className="px-3 py-3">平台佣金</th>
            <th className="px-3 py-3">平台服务费</th>
            <th className="px-3 py-3">联盟达人佣金</th>
            <th className="px-3 py-3">主体税务成本</th>
            <th className="px-3 py-3">广告费用</th>
            <th className="px-3 py-3">尾程 / 退款</th>
            <th className="px-3 py-3">商品成本</th>
            <th className="px-3 py-3">头程物流</th>
            <th className="px-3 py-3">仓库费用</th>
            <th className="px-3 py-3">利润</th>
            <th className="px-3 py-3">核算状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <OrderRow
              key={row.orderId}
              row={row}
              expanded={expanded === row.orderId}
              onToggle={() => onToggle(row.orderId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderRow({
  row,
  expanded,
  onToggle,
}: {
  row: ProfitRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={
          row.includedInProfit
            ? "hover:bg-slate-800/40"
            : "bg-slate-900/40 text-slate-500"
        }
      >
        <td className="px-3 py-3">
          <button
            type="button"
            onClick={onToggle}
            title="查看费用明细"
            className="rounded p-1 text-slate-400 hover:bg-slate-700"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-3">
          <div className="font-mono text-xs">{row.orderId}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
            <Store className="h-3.5 w-3.5 text-orange-400" />
            {row.shopName} · {row.countryCode}
          </div>
          <div className="mt-1 text-[11px] text-slate-600">
            {formatOrderDateTime(row.createTime, row.countryCode)}
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-slate-300">
          {row.status}
          {row.exclusionReason && (
            <div className="mt-1 text-[11px] text-amber-300">
              {row.exclusionReason}
            </div>
          )}
        </td>
        <td className="px-3 py-3">
          <div>{money(row.gmvCny)}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {row.gmvSource === "OFFICIAL_MERCHANDISE_SUBTOTAL"
              ? "官方商品小计"
              : "商品小计估算"}{" "}
            {money(row.gmvOriginal, row.currency)} ·{" "}
            {row.exchangeRate.toFixed(4)}
          </div>
        </td>
        <td className="px-3 py-3 text-rose-300">
          {money(row.commissionFeeCny)}
          <div className="mt-1 text-[11px] text-slate-500">
            Commission Fee{" "}
            {orderIncomeAmountLabel(row.settlementStatus, row.commissionFeeOriginal, row.currency)}
          </div>
        </td>
        <td className="px-3 py-3 text-rose-300">
          {money(row.serviceFeeCny)}
          <div className="mt-1 text-[11px] text-slate-500">
            Service Fee{" "}
            {orderIncomeAmountLabel(row.settlementStatus, row.serviceFeeOriginal, row.currency)}
          </div>
        </td>
        <td className="px-3 py-3 text-rose-300">
          {!row.includedInProfit
            ? "未计入"
            : row.settlementStatus === "ACTUAL"
              ? money(row.affiliateCommissionCny)
              : "待结算"}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit
              ? `AMS Commission Fee ${affiliateCommissionAmountLabel(row.settlementStatus, row.affiliateCommissionOriginal, row.currency)}`
              : ""}
          </div>
        </td>
        <td
          className={
            row.taxStatus === "ACTUAL"
              ? "px-3 py-3 text-rose-300"
              : "px-3 py-3 text-amber-300"
          }
        >
          {!row.includedInProfit
            ? "未计入"
            : row.taxStatus === "ACTUAL"
              ? money(row.taxCostCny)
              : "待配置"}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit
              ? row.taxStatus === "ACTUAL"
                ? `${row.taxRatePercent}% · ${money(row.taxCostOriginal, row.currency)}`
                : "缺少店铺税率规则"
              : ""}
          </div>
        </td>
        <td className="px-3 py-3 text-rose-300">
          {row.includedInProfit ? money(row.advertisingCny) : "未计入"}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit
              ? row.advertisingStatus === "ACTUAL"
                ? `官方日消耗分摊 ${money(row.advertisingOriginal, row.advertisingCurrency)}`
                : "广告接口取数失败"
              : ""}
          </div>
        </td>
        <td className="px-3 py-3 text-rose-300">
          {money(row.shippingCny + row.refundCny)}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit
              ? `物流 ${money(row.shippingOriginal, row.currency)} · 退款 ${money(row.refundOriginal, row.currency)}`
              : "未计入"}
          </div>
        </td>
        <td className="px-3 py-3">
          {money(row.productCostCny)}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit
              ? row.productCostStatus === "ACTUAL"
                ? "已匹配 SKU"
                : "缺少 SKU 映射"
              : "未计入"}
          </div>
        </td>
        <td
          className={
            row.firstMileStatus === "ACTUAL"
              ? "px-3 py-3"
              : "px-3 py-3 text-amber-300"
          }
        >
          {row.includedInProfit
            ? row.firstMileStatus === "ACTUAL"
              ? money(row.firstMileLogisticsCny)
              : "待完善"
            : "未计入"}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit
              ? row.firstMileStatus === "ACTUAL"
                ? "出库批次按体积分摊"
                : "SKU 缺头程成本"
              : ""}
          </div>
        </td>
        <td
          className={
            row.includedInProfit
              ? row.warehouseStatus === "MISSING"
                ? "px-3 py-3 text-amber-300"
                : "px-3 py-3 text-emerald-300"
              : "px-3 py-3"
          }
        >
          {!row.includedInProfit
            ? "未计入"
            : row.warehouseStatus === "MISSING"
              ? "待完善"
              : money(row.warehouseCostCny)}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit ? row.warehouseName || "" : ""}
          </div>
        </td>
        <td
          className={`px-3 py-3 font-semibold ${row.includedInProfit ? (row.profitCny >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-500"}`}
        >
          {money(row.profitCny)}
          <div className="mt-1 text-[11px] text-slate-500">
            {row.includedInProfit ? `${row.margin.toFixed(2)}%` : "未计入利润"}
          </div>
        </td>
        <td className="px-3 py-3 text-xs">
          {row.includedInProfit ? (
            <>
              <span
                className={
                  row.coverage === "COMPLETE"
                    ? "text-emerald-300"
                    : "text-rose-300"
                }
              >
                {row.coverage === "COMPLETE" ? "成本完整" : "待完善"}
              </span>
              <div className="mt-1 text-[11px] text-slate-500">
                结算：
                {orderIncomeStageLabel(row.settlementStatus)}
              </div>
            </>
          ) : (
            <span className="text-slate-500">已排除</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={15} className="bg-slate-950/70 px-6 py-4">
            <div className="grid gap-5 text-xs lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-medium text-slate-200">
                  订单商品与成本
                </h3>
                <div className="space-y-2 text-slate-400">
                  {row.lines.length ? (
                    row.lines.map((line) => (
                      <div
                        key={`${line.itemId}-${line.modelId}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-slate-800 pb-2"
                      >
                        <span className="truncate" title={line.name}>
                          {line.name} · {line.sku || "无 SKU"} × {line.quantity}
                        </span>
                        <span
                          className={
                            line.mapped && line.firstMileCovered
                              ? "text-slate-300"
                              : "text-amber-300"
                          }
                        >
                          采购{" "}
                          {line.mapped ? money(line.lineCostCny) : "未映射"} ·
                          头程{" "}
                          {line.firstMileCovered
                            ? money(line.firstMileLogisticsCny)
                            : "缺失"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div>未返回商品明细</div>
                  )}
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-slate-200">
                  当前核算口径
                </h3>
                <div className="space-y-1.5 text-slate-400">
                  <div>
                    平台费用：直接取订单官方结算净额的 Commission Fee、Service
                    Fee 先按订单收入明细核算；AMS Commission Fee 仅在最终结算后计入利润成本
                  </div>
                  <div>
                    官方平台佣金净额{" "}
                    {money(row.commissionFeeOriginal, row.currency)} ·
                    官方平台服务费净额{" "}
                    {money(row.serviceFeeOriginal, row.currency)} · 合计{" "}
                    {money(row.officialPlatformFeesOriginal, row.currency)}
                  </div>
                  <div>
                    联盟达人佣金 AMS Commission Fee{" "}
                    {affiliateCommissionAmountLabel(row.settlementStatus, row.affiliateCommissionOriginal, row.currency)}
                    （以 Shopee 最终结算字段为准）
                  </div>
                  <div>
                    店铺主体税务成本：订单 GMV × 订单日期生效的店铺税率
                    {row.taxStatus === "ACTUAL"
                      ? `（当前 ${row.taxRatePercent}%）`
                      : "（当前缺少规则）"}
                  </div>
                  <div>
                    广告费用：Shopee 数据分析官方日消耗 ÷
                    同店铺同业务日有效订单数，每笔订单平均分摊
                  </div>
                  <div>
                    广告充值审计值：
                    {money(
                      row.advertisingSettlementFundingOriginal,
                      row.currency,
                    )}
                    ，仅供核对，不重复计入成本
                  </div>
                  <div>
                    头程物流：与 TikTok 相同，柜子/出库批次物流费按 SKU
                    体积分摊为单件成本
                  </div>
                  <div>
                    尾程物流：平台最终物流费（已包含 Shopee 补贴抵扣）+
                    逆向物流费
                  </div>
                  <div>
                    仓库：{row.warehouseName || "未配置"} ·{" "}
                    {row.warehouseStatus === "MISSING"
                      ? "规则或 SKU 尺寸缺失"
                      : `出库 ${money(row.warehouseFeeBreakdown?.orderOutbound || 0, row.warehouseFeeBreakdown?.currency || "BRL")} · 包材 ${money(row.warehouseFeeBreakdown?.packaging || 0, row.warehouseFeeBreakdown?.currency || "BRL")} · 超尺寸 ${money(row.warehouseFeeBreakdown?.oversize || 0, row.warehouseFeeBreakdown?.currency || "BRL")}`}
                  </div>
                  <div>
                    {row.warehouseFeeBreakdown
                      ? `计费重量 ${row.warehouseFeeBreakdown.chargeableWeightKg.toFixed(4)}kg · 体积重 ${(row.warehouseFeeBreakdown.volumetricWeightKg || 0).toFixed(4)}kg · 计费件数 ${row.warehouseFeeBreakdown.billedUnits}`
                      : ""}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CoveragePanel({
  coverage,
  summary,
}: {
  coverage?: Coverage;
  summary?: Aggregate;
}) {
  const rows = [
    [
      "逐单官方结算",
      coverage?.settlement || 0,
      `${coverage?.settlementOrders || 0} / ${summary?.orders || 0} 单`,
    ],
    [
      "采购成本覆盖",
      coverage?.productCost || 0,
      `${coverage?.productCoveredUnits || 0} / ${summary?.units || 0} 件`,
    ],
    [
      "头程物流覆盖",
      coverage?.firstMile || 0,
      `${coverage?.firstMileCoveredUnits || 0} / ${summary?.units || 0} 件`,
    ],
    [
      "广告数据覆盖",
      coverage?.advertising || 0,
      `${coverage?.advertisingCoveredOrders || 0} / ${summary?.orders || 0} 单`,
    ],
    [
      "主体税率覆盖",
      coverage?.tax || 0,
      `${coverage?.taxCoveredOrders || 0} / ${summary?.orders || 0} 单`,
    ],
    [
      "仓库费用覆盖",
      coverage?.warehouse || 0,
      `${coverage?.warehouseCoveredOrders || 0} / ${summary?.orders || 0} 单`,
    ],
  ] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map(([label, value, detail]) => (
        <div
          key={label}
          className="rounded-md border border-slate-800 bg-slate-900 p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm">{label}</span>
            <span className="text-sm font-semibold text-emerald-300">
              {value.toFixed(2)}%
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded bg-slate-800">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.min(100, value)}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">{detail}</div>
        </div>
      ))}
    </div>
  );
}

function shopeeStatusLabel(status: string) {
  const labels: Record<string, string> = {
    UNPAID: "未付款",
    READY_TO_SHIP: "待发货",
    PROCESSED: "已处理",
    SHIPPED: "已发货",
    TO_CONFIRM_RECEIVE: "待确认收货",
    IN_CANCEL: "取消中",
    CANCELLED: "已取消",
    COMPLETED: "已完成",
  };
  return labels[status] || status || "未知状态";
}

function shopeeStatusTone(status: string) {
  if (["CANCELLED", "IN_CANCEL"].includes(status))
    return "bg-rose-500/15 text-rose-300";
  if (status === "COMPLETED") return "bg-emerald-500/15 text-emerald-300";
  if (status === "UNPAID") return "bg-amber-500/15 text-amber-300";
  return "bg-sky-500/15 text-sky-300";
}

function ShopeeProductThumbnail({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-700 bg-slate-900 text-slate-600">
      <ImageIcon className="h-4 w-4" aria-hidden="true" />
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`${name} 商品图`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

function ShopeeCostSections({
  row,
  desktop = false,
}: {
  row: ProfitRow;
  desktop?: boolean;
}) {
  const sections = [
    {
      key: "income",
      label: "收入与平台",
      frame: "border-emerald-500/25 bg-emerald-500/[0.04]",
      tone: "text-emerald-300",
      items: [
        {
          label: "GMV",
          value: row.gmvCny,
          original: `${row.gmvSource === "OFFICIAL_MERCHANDISE_SUBTOTAL" ? "官方商品小计" : "商品小计估算"} ${money(row.gmvOriginal, row.currency)}`,
        },
        {
          label: "平台佣金",
          value: row.commissionFeeCny,
          original:
            hasOfficialOrderIncome(row.settlementStatus)
              ? `Commission Fee ${orderIncomeAmountLabel(row.settlementStatus, row.commissionFeeOriginal, row.currency)}`
              : "待订单收入明细",
        },
        {
          label: "平台服务费",
          value: row.serviceFeeCny,
          original:
            hasOfficialOrderIncome(row.settlementStatus)
              ? `Service Fee ${orderIncomeAmountLabel(row.settlementStatus, row.serviceFeeOriginal, row.currency)}`
              : "待订单收入明细",
        },
        {
          label: "联盟达人佣金",
          value: row.affiliateCommissionCny,
          original: `AMS Commission Fee ${affiliateCommissionAmountLabel(row.settlementStatus, row.affiliateCommissionOriginal, row.currency)}`,
        },
        {
          label: "主体税务成本",
          value: row.taxCostCny,
          original:
            row.taxStatus === "ACTUAL"
              ? `${row.taxRatePercent}% · ${money(row.taxCostOriginal, row.currency)}`
              : "缺少店铺税率规则",
        },
      ],
    },
    {
      key: "product",
      label: "商品与物流",
      frame: "border-sky-500/25 bg-sky-500/[0.04]",
      tone: "text-sky-300",
      items: [
        {
          label: "采购成本",
          value: row.productCostCny,
          original:
            row.productCostStatus === "ACTUAL" ? "SKU 已映射" : "缺少 SKU 映射",
        },
        {
          label: "尾程 / 退款",
          value: row.shippingCny + row.refundCny,
          original: `物流 ${money(row.shippingOriginal, row.currency)} · 退款 ${money(row.refundOriginal, row.currency)}`,
        },
      ],
    },
    {
      key: "warehouse",
      label: "广告与仓配",
      frame: "border-amber-500/25 bg-amber-500/[0.04]",
      tone: "text-amber-300",
      items: [
        {
          label: "广告费用",
          value: row.advertisingCny,
          original:
            row.advertisingStatus === "ACTUAL"
              ? `官方日消耗 ${money(row.advertisingOriginal, row.advertisingCurrency)}`
              : "广告接口取数失败",
        },
        {
          label: "仓库费用",
          value: row.warehouseCostCny,
          original:
            row.warehouseStatus === "MISSING"
              ? "规则或 SKU 尺寸缺失"
              : row.warehouseName || "已核算",
        },
      ],
    },
    {
      key: "costs",
      label: "头程与总成本",
      frame: "border-slate-700 bg-slate-900/30",
      tone: "text-slate-400",
      items: [
        {
          label: "头程物流",
          value: row.firstMileLogisticsCny,
          original:
            row.firstMileStatus === "ACTUAL"
              ? "出库批次按体积分摊"
              : "SKU 缺头程成本",
        },
        {
          label: "总成本",
          value: row.costsCny,
          original: "已含主体税、广告与头程",
        },
      ],
    },
  ];
  return (
    <div
      className={
        desktop ? "grid grid-cols-4 gap-2" : "grid gap-2 sm:grid-cols-2"
      }
    >
      {sections.map((section) => (
        <section
          key={section.key}
          className={`min-w-0 rounded-md border p-2 ${section.frame}`}
        >
          <div className={`mb-1.5 text-[10px] font-semibold ${section.tone}`}>
            {section.label}
          </div>
          <div className="divide-y divide-slate-800/80">
            {section.items.map((item) => (
              <div
                key={item.label}
                className="min-w-0 py-1.5 first:pt-0 last:pb-0"
              >
                <div className={`text-[10px] leading-4 ${section.tone}`}>
                  {item.label}
                </div>
                <div className="mt-0.5 text-xs font-medium tabular-nums text-slate-200">
                  {!row.includedInProfit
                    ? "未计入"
                    : item.label === "联盟达人佣金" && row.settlementStatus !== "ACTUAL"
                      ? "待结算"
                      : money(item.value)}
                </div>
                {row.includedInProfit && (
                  <div className="mt-0.5 break-words text-[10px] leading-4 text-slate-500">
                    {item.original}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ShopeeProfitPanel({ row }: { row: ProfitRow }) {
  const warnings = !row.includedInProfit
    ? row.exclusionReason
      ? [row.exclusionReason]
      : []
    : [
        ...(row.productCostStatus === "MISSING" ? ["缺采购成本"] : []),
        ...(row.firstMileStatus === "MISSING" ? ["缺头程成本"] : []),
        ...(row.advertisingStatus === "MISSING" ? ["缺广告数据"] : []),
        ...(row.taxStatus === "MISSING" ? ["缺主体税率"] : []),
        ...(row.warehouseStatus === "MISSING" ? ["缺仓库费用"] : []),
        ...(row.settlementStatus === "ESTIMATED"
          ? ["订单收入为预计值，达人佣金待最终结算"]
          : row.settlementStatus === "MISSING"
            ? ["平台费/达人佣金/尾程待收入明细"]
            : []),
      ];
  const positive = row.profitCny >= 0;
  return (
    <div
      className={`flex h-full min-h-0 flex-col justify-between rounded-md border p-2.5 ${positive ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-rose-500/20 bg-rose-500/[0.04]"}`}
    >
      <div>
        <div className="text-[10px] font-medium text-slate-500">贡献利润</div>
        <div
          className={`mt-1 text-base font-semibold tabular-nums ${positive ? "text-emerald-300" : "text-rose-300"}`}
        >
          {row.includedInProfit ? money(row.profitCny) : "未计入"}
        </div>
        <div className="mt-1 text-[11px] tabular-nums text-slate-400">
          利润率 {row.includedInProfit ? `${row.margin.toFixed(2)}%` : "-"}
        </div>
      </div>
      <div className="mt-3 border-t border-slate-800/80 pt-2">
        {warnings.length === 0 ? (
          <span className="inline-flex rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300">
            已知成本完整
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {warnings.map((warning) => (
              <span
                key={warning}
                className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300"
              >
                {warning}
              </span>
            ))}
          </div>
        )}
        {row.includedInProfit && (
          <>
            <span
              className={`mt-2 inline-flex rounded px-1.5 py-0.5 text-[11px] ${row.settlementStatus === "ACTUAL" ? "bg-emerald-500/10 text-emerald-300" : row.settlementStatus === "ESTIMATED" ? "bg-amber-500/10 text-amber-300" : "bg-slate-500/10 text-slate-400"}`}
            >
              {row.settlementStatus === "ACTUAL" ? "官方最终收入" : row.settlementStatus === "ESTIMATED" ? "官方预计收入" : "待收入明细"}
            </span>
            <div className="mt-1 text-[10px] text-slate-600">
              广告按有效订单数均分 · 头程按 SKU 核算
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PeriodOrdersDialog({
  period,
  countryCode,
  shopId,
  status,
  onClose,
}: {
  period: Aggregate;
  countryCode: string;
  shopId: string;
  status: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [keyword, setKeyword] = useState("");
  const [detailShopId, setDetailShopId] = useState(shopId);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          startDate: period.startDate,
          endDate: period.endDate,
          groupBy: "day",
          page: String(page),
          pageSize: "50",
        });
        if (countryCode) params.set("countryCode", countryCode);
        if (detailShopId) params.set("shopId", detailShopId);
        if (status) params.set("status", status);
        if (keyword) params.set("keyword", keyword);
        const response = await fetch(
          `/api/shopee/profit?${params.toString()}`,
          { cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "订单明细加载失败");
        if (active) setData(body);
      } catch (loadError) {
        if (active)
          setError(
            loadError instanceof Error ? loadError.message : "订单明细加载失败",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    countryCode,
    detailShopId,
    keyword,
    page,
    period.endDate,
    period.startDate,
    reloadKey,
    status,
  ]);
  const summary = data?.summary || period;
  const rows = data?.rows || [];
  const availableShops = (data?.shops || []).filter(
    (shop) =>
      (!countryCode || normalizedCountry(shop.region) === countryCode) &&
      (!shopId || shop.shopId === shopId),
  );
  const rangeLabel =
    period.startDate === period.endDate
      ? period.startDate
      : `${period.startDate} 至 ${period.endDate}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/75 p-0 md:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${rangeLabel} Shopee 订单明细`}
    >
      <div className="flex min-h-0 w-full max-w-[1800px] flex-col overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl md:rounded-md">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 md:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100 md:text-lg">
              {rangeLabel} 订单核算明细
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              按订单所属店铺区分 · 广告按同店铺同日有效订单数均分 · 头程沿用
              TikTok 同源规则
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-800 px-4 py-3 md:px-6">
          <div className="grid divide-y divide-slate-800 border-b border-slate-800 pb-3 sm:grid-cols-6 sm:divide-x sm:divide-y-0">
            {[
              ["当前订单", summary.totalOrders.toLocaleString()],
              ["计入核算", summary.orders.toLocaleString()],
              [
                "取消 / 未付款",
                `${summary.cancelledOrders.toLocaleString()} / ${summary.unpaidOrders.toLocaleString()}`,
              ],
              ["销售件数", summary.units.toLocaleString()],
              [
                "实物件数",
                (summary.internalUnits ?? summary.units).toLocaleString(),
              ],
              [
                "GMV / 贡献利润",
                `${money(summary.gmvCny)} / ${money(summary.profitCny)}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 px-3 py-2 first:pl-0 sm:py-0">
                <div className="text-[11px] text-slate-500">{label}</div>
                <div
                  className="mt-1 truncate text-sm font-semibold tabular-nums text-slate-200"
                  title={value}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索订单号、SKU、商品、买家或店铺"
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-9 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-400"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-orange-400" />
              )}
            </label>
            <select
              value={detailShopId}
              onChange={(event) => {
                setDetailShopId(event.target.value);
                setPage(1);
              }}
              aria-label="按店铺筛选订单"
              className="h-9 min-w-[190px] rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200 outline-none focus:border-orange-400"
            >
              {!shopId && <option value="">全部店铺</option>}
              {availableShops.map((shop) => (
                <option key={shop.shopId} value={shop.shopId}>
                  {shop.shopName || shop.shopId}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {loading && !data && (
            <div className="flex h-56 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在核算当天订单...
            </div>
          )}
          {error && (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-sm text-rose-300">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setReloadKey((value) => value + 1)}
                className="h-9 rounded-md border border-slate-700 px-3 text-slate-300 hover:bg-slate-800"
              >
                重试
              </button>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="flex h-56 items-center justify-center text-sm text-slate-500">
              没有匹配的订单
            </div>
          )}
          {!error && rows.length > 0 && (
            <>
              <div
                className="hidden xl:block"
                data-testid="shopee-profit-order-desktop-list"
              >
                <div className="sticky top-0 z-10 grid grid-cols-[0.8fr_0.95fr_1.7fr_4.2fr_1.2fr] border-b border-slate-800 bg-slate-950 text-[11px] text-slate-500">
                  <div className="px-3 py-3 font-medium">店铺 / 状态</div>
                  <div className="px-3 py-3 font-medium">订单 / 时间</div>
                  <div className="px-3 py-3 font-medium">SKU / 商品</div>
                  <div className="px-3 py-3 font-medium">
                    核算金额（销售件 / 实物件：人民币及原币）
                  </div>
                  <div className="px-3 py-3 font-medium">利润 / 状态</div>
                </div>
                <div className="divide-y divide-slate-900">
                  {rows.map((row) => (
                    <article
                      key={row.orderId}
                      className={`grid grid-cols-[0.8fr_0.95fr_1.7fr_4.2fr_1.2fr] items-stretch text-xs ${row.includedInProfit ? "hover:bg-slate-900/60" : "bg-slate-900/30 text-slate-500"}`}
                    >
                      <div className="flex min-w-0 flex-col justify-center px-3 py-3">
                        <div className="break-words text-slate-300">
                          {row.shopName}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          {row.countryCode}
                        </div>
                        <span
                          className={`mt-1 inline-flex w-fit rounded px-1.5 py-0.5 text-[11px] ${shopeeStatusTone(row.status)}`}
                        >
                          {shopeeStatusLabel(row.status)}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-col justify-center px-3 py-3">
                        <div className="break-all font-medium tabular-nums text-slate-200">
                          {row.orderId}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {formatOrderDateTime(row.createTime, row.countryCode)}
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col justify-center px-3 py-3">
                        {row.lines.length ? (
                          row.lines.map((line, index) => (
                            <div
                              key={`${line.itemId}-${line.modelId}-${index}`}
                              className="mb-2 flex min-w-0 items-center gap-2.5 last:mb-0"
                            >
                              <ShopeeProductThumbnail
                                imageUrl={line.imageUrl}
                                name={line.name}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-300">
                                  {line.sku || "无 SKU"} × {line.quantity}
                                </div>
                                <div className="text-[11px] tabular-nums text-emerald-300">
                                  前端售价{" "}
                                  {money(
                                    line.quantity > 0
                                      ? line.lineValueOriginal / line.quantity
                                      : 0,
                                    row.currency,
                                  )}{" "}
                                  / 件
                                  {line.quantity > 1
                                    ? ` · 小计 ${money(line.lineValueOriginal, row.currency)}`
                                    : ""}
                                </div>
                                <div
                                  className="truncate text-[11px] text-slate-500"
                                  title={line.name}
                                >
                                  {line.name}
                                </div>
                                {line.internalQuantity !== line.quantity && (
                                  <div className="text-[10px] text-slate-600">
                                    对应实物 {line.internalQuantity} 件
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-600">未返回商品明细</span>
                        )}
                      </div>
                      <div className="min-w-0 px-3 py-3">
                        <div className="mb-2 text-[11px] text-slate-500">
                          销售件 / 实物件{" "}
                          <span className="ml-1 font-medium tabular-nums text-slate-300">
                            {row.units} / {row.internalUnits ?? row.units}
                          </span>
                        </div>
                        <ShopeeCostSections row={row} desktop />
                      </div>
                      <div className="min-w-0 px-3 py-3">
                        <ShopeeProfitPanel row={row} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-slate-800 xl:hidden">
                {rows.map((row) => (
                  <article key={row.orderId} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-200">
                          {row.shopName}
                        </div>
                        <div className="mt-1 break-all text-xs tabular-nums text-slate-500">
                          {row.orderId} ·{" "}
                          {formatOrderDateTime(row.createTime, row.countryCode)}
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${shopeeStatusTone(row.status)}`}
                      >
                        {shopeeStatusLabel(row.status)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {row.lines.map((line, index) => (
                        <div
                          key={`${line.itemId}-${line.modelId}-${index}`}
                          className="flex min-w-0 items-center gap-3"
                        >
                          <ShopeeProductThumbnail
                            imageUrl={line.imageUrl}
                            name={line.name}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-slate-300">
                              {line.sku || "无 SKU"} × {line.quantity}
                            </div>
                            <div className="text-[11px] tabular-nums text-emerald-300">
                              前端售价{" "}
                              {money(
                                line.quantity > 0
                                  ? line.lineValueOriginal / line.quantity
                                  : 0,
                                row.currency,
                              )}{" "}
                              / 件
                              {line.quantity > 1
                                ? ` · 小计 ${money(line.lineValueOriginal, row.currency)}`
                                : ""}
                            </div>
                            <div className="truncate text-xs text-slate-600">
                              {line.name}
                            </div>
                            {line.internalQuantity !== line.quantity && (
                              <div className="text-[10px] text-slate-600">
                                对应实物 {line.internalQuantity} 件
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-slate-800 pt-3 text-xs">
                      <div className="mb-2 text-[11px] text-slate-500">
                        销售件 / 实物件{" "}
                        <span className="ml-1 text-slate-300">
                          {row.units} / {row.internalUnits ?? row.units}
                        </span>
                      </div>
                      <ShopeeCostSections row={row} />
                    </div>
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <ShopeeProfitPanel row={row} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
        {data?.pagination && data.pagination.total > 0 && (
          <div className="shrink-0 border-t border-slate-800">
            <Pagination
              total={data.pagination.total}
              page={data.pagination.page}
              pageSize={data.pagination.pageSize}
              onPageChange={setPage}
              onPageSizeChange={() => undefined}
              showAllOption={false}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
