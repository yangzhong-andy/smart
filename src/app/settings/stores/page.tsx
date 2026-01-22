"use client";

import { useEffect, useState, useMemo } from "react";
import { Megaphone, Pencil, Trash2, Search, X, Download, Wallet, Globe, Building2, Users } from "lucide-react";
import { type Store, getStores, saveStores } from "@/lib/store-store";
import { type BankAccount, getAccounts, saveAccounts } from "@/lib/finance-store";
import { COUNTRIES, getCurrencyByCountry, getCountriesByRegion, getCountryByCode, type Country } from "@/lib/country-config";
import { getInfluencerStats } from "@/lib/influencer-bd-store";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return dateString;
  }
};

export default function StoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [storesReady, setStoresReady] = useState(false);
  const [influencerStats, setInfluencerStats] = useState({ pendingSample: 0, creating: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editStore, setEditStore] = useState<Store | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "platform" | "created">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [hoveredStoreId, setHoveredStoreId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    platform: "TikTok" as Store["platform"],
    country: "",
    currency: "USD" as Store["currency"],
    accountId: "",
    vatNumber: "",
    taxId: ""
  });

  const countriesByRegion = useMemo(() => getCountriesByRegion(), []);

  // 当选择国家时，自动关联货币
  useEffect(() => {
    if (form.country) {
      const currency = getCurrencyByCountry(form.country) as Store["currency"];
      if (currency) {
        setForm((f) => ({ ...f, currency }));
      }
    }
  }, [form.country]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // 获取达人统计
    const stats = getInfluencerStats();
    setInfluencerStats(stats);
    
    let loaded = getStores();
    const loadedAccounts = getAccounts();
    
    // 兼容旧数据：将 shopName 迁移到 storeId
    const needsMigration = loadedAccounts.some((acc) => (acc as any).shopName && !acc.storeId);
    if (needsMigration && loaded.length > 0) {
      // 尝试根据 shopName 匹配现有店铺
      loadedAccounts.forEach((acc) => {
        const oldShopName = (acc as any).shopName;
        if (oldShopName && !acc.storeId) {
          const matchingStore = loaded.find((s) => s.name === oldShopName);
          if (matchingStore) {
            (acc as any).storeId = matchingStore.id;
            delete (acc as any).shopName;
          }
        }
      });
      saveAccounts(loadedAccounts);
    }
    
    // 修复现有店铺的 country 字段（如果缺失）
    let needsSave = false;
    loaded.forEach((store) => {
      if (!store.country) {
        needsSave = true;
        // 根据店铺名称推断国家
        if (store.name.includes("UK") || store.currency === "GBP") {
          store.country = "UK";
        } else if (store.name.includes("US") || store.currency === "USD") {
          store.country = "US";
        } else if (store.name.includes("JP") || store.currency === "JPY") {
          store.country = "JP";
        } else if (store.name.includes("DE") || store.currency === "EUR") {
          store.country = "DE";
        } else if (store.name.includes("AU") || store.currency === "AUD") {
          store.country = "AU";
        } else {
          // 默认值
          store.country = "US";
        }
      }
    });
    
    if (needsSave) {
      saveStores(loaded);
    }
    
    // 不再自动创建测试店铺，所有店铺数据由用户手动创建
    
    setStores(loaded);
    setAccounts(loadedAccounts);
    setStoresReady(true);
  }, []);


  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!storesReady) return;
    saveStores(stores);
  }, [stores, storesReady]);

  const resetForm = () => {
    setForm({
      name: "",
      platform: "TikTok",
      country: "",
      currency: "USD",
      accountId: "",
      vatNumber: "",
      taxId: ""
    });
    setEditStore(null);
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("店铺名称是必填项");
      return;
    }
    if (!form.accountId) {
      toast.error("请选择关联收款账户", { icon: "⚠️", duration: 3000 });
      return;
    }
    const account = accounts.find((a) => a.id === form.accountId);
    if (!account) {
      toast.error("账户不存在", { icon: "⚠️", duration: 3000 });
      return;
    }

    if (!form.country) {
      toast.error("请选择国家", { icon: "⚠️", duration: 3000 });
      return;
    }

    const newStore: Store = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      platform: form.platform,
      country: form.country,
      currency: form.currency,
      accountId: form.accountId,
      accountName: account.name,
      vatNumber: form.vatNumber.trim() || undefined,
      taxId: form.taxId.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    setStores((prev) => [...prev, newStore]);
    resetForm();
    setIsModalOpen(false);
  };

  const handleEdit = (store: Store) => {
    setEditStore(store);
    setForm({
      name: store.name,
      platform: store.platform,
      country: store.country || "",
      currency: store.currency,
      accountId: store.accountId,
      vatNumber: store.vatNumber || "",
      taxId: store.taxId || ""
    });
    setIsModalOpen(true);
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editStore) return;
    if (!form.name.trim()) {
      alert("店铺名称是必填项");
      return;
    }
    if (!form.accountId) {
      toast.error("请选择关联收款账户", { icon: "⚠️", duration: 3000 });
      return;
    }
    const account = accounts.find((a) => a.id === form.accountId);
    if (!account) {
      toast.error("账户不存在", { icon: "⚠️", duration: 3000 });
      return;
    }

    if (!form.country) {
      toast.error("请选择国家", { icon: "⚠️", duration: 3000 });
      return;
    }

    setStores((prev) =>
      prev.map((s) =>
        s.id === editStore.id
          ? {
              ...s,
              name: form.name.trim(),
              platform: form.platform,
              country: form.country,
              currency: form.currency,
              accountId: form.accountId,
              accountName: account.name,
              vatNumber: form.vatNumber.trim() || undefined,
              taxId: form.taxId.trim() || undefined
            }
          : s
      )
    );
    resetForm();
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("确定要删除这个店铺吗？")) return;
    setStores((prev) => prev.filter((s) => s.id !== id));
  };

  // 统计数据
  const storeStats = useMemo(() => {
    const total = stores.length;
    const tiktok = stores.filter(s => s.platform === "TikTok").length;
    const amazon = stores.filter(s => s.platform === "Amazon").length;
    const withVAT = stores.filter(s => s.vatNumber || s.taxId).length;
    return { total, tiktok, amazon, withVAT };
  }, [stores]);

  // 搜索和筛选
  const filteredAndSortedStores = useMemo(() => {
    let filtered = stores;

    // 搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.platform.toLowerCase().includes(query) ||
          (s.country && getCountryByCode(s.country)?.name.toLowerCase().includes(query)) ||
          (s.accountName && s.accountName.toLowerCase().includes(query))
      );
    }

    // 平台筛选
    if (filterPlatform !== "all") {
      filtered = filtered.filter(s => s.platform === filterPlatform);
    }

    // 国家筛选
    if (filterCountry !== "all") {
      filtered = filtered.filter(s => s.country === filterCountry);
    }

    // 排序
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "name") {
        comparison = a.name.localeCompare(b.name, "zh-Hans-CN");
      } else if (sortBy === "platform") {
        comparison = a.platform.localeCompare(b.platform);
      } else if (sortBy === "created") {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [stores, searchQuery, filterPlatform, filterCountry, sortBy, sortOrder]);

  const handleExportData = () => {
    const csvData = filteredAndSortedStores.map((s) => {
      const country = getCountryByCode(s.country);
      return {
        店铺名称: s.name,
        所属平台: s.platform,
        国家站点: country ? `${country.name} (${country.code})` : s.country || "",
        经营币种: s.currency,
        关联收款账户: s.accountName || "",
        VAT税务识别号: s.vatNumber || "",
        税务识别号: s.taxId || "",
        创建时间: new Date(s.createdAt).toLocaleString("zh-CN")
      };
    });

    if (csvData.length === 0) {
      toast.error("没有数据可导出");
      return;
    }

    const headers = Object.keys(csvData[0]);
    const rows = csvData.map((row) => {
      const rowValues = headers.map((h) => {
        const value = row[h as keyof typeof row];
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      return rowValues.join(",");
    });
    const csvContent = [headers.join(","), ...rows].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `店铺管理_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("数据已导出");
  };

  return (
    <div className="space-y-6">
      {/* 顶部Tab导航 */}
      <div className="flex gap-4 border-b border-slate-800">
        <button
          onClick={() => router.push("/settings/stores")}
          className="px-4 py-3 text-base font-semibold text-white border-b-2 border-primary-500 transition-colors"
        >
          店铺管理
        </button>
        <button
          onClick={() => router.push("/advertising/influencers")}
          className="px-4 py-3 text-base font-semibold text-slate-400 hover:text-white transition-colors relative"
        >
          达人中心
          <span className="ml-2 text-xs font-normal text-slate-500">
            待寄样: {influencerStats.pendingSample} | 创作中: {influencerStats.creating}
          </span>
        </button>
      </div>

      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">店铺管理</h1>
          <p className="mt-1 text-sm text-slate-400">管理店铺档案，关联收款账户，支持财务回款联动。</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportData}
            disabled={filteredAndSortedStores.length === 0}
            className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-300 shadow hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="h-4 w-4" />
            导出数据
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px transition-colors"
          >
            <Megaphone className="h-4 w-4" />
            新增店铺
          </button>
        </div>
      </header>

      {accounts.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          请先前往"财务中心 - 账户列表"创建收款账户，然后再添加店铺。
        </div>
      )}

      {/* 统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">总店铺数</p>
              <p className="text-2xl font-bold text-slate-100" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {storeStats.total}
              </p>
            </div>
            <Building2 className="h-8 w-8 text-primary-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #065f46 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">TikTok店铺</p>
              <p className="text-2xl font-bold text-emerald-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {storeStats.tiktok}
              </p>
            </div>
            <Megaphone className="h-8 w-8 text-emerald-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #7c2d12 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">Amazon店铺</p>
              <p className="text-2xl font-bold text-orange-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {storeStats.amazon}
              </p>
            </div>
            <Megaphone className="h-8 w-8 text-orange-300 opacity-50" />
          </div>
        </div>
        <div
          className="relative overflow-hidden rounded-2xl border p-5 transition-all hover:scale-[1.02]"
          style={{
            background: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)"
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 mb-1">有税务识别</p>
              <p className="text-2xl font-bold text-purple-300" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {storeStats.withVAT}
              </p>
            </div>
            <Globe className="h-8 w-8 text-purple-300 opacity-50" />
          </div>
        </div>
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索店铺名称、平台、国家..."
            className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部平台</option>
            <option value="TikTok">TikTok</option>
            <option value="Amazon">Amazon</option>
            <option value="其他">其他</option>
          </select>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部国家</option>
            {Array.from(new Set(stores.map(s => s.country).filter(Boolean))).map(countryCode => {
              const country = getCountryByCode(countryCode);
              return (
                <option key={countryCode} value={countryCode}>
                  {country ? country.name : countryCode}
                </option>
              );
            })}
          </select>
          <button
            onClick={() => {
              if (sortBy === "name") {
                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
              } else {
                setSortBy("name");
                setSortOrder("asc");
              }
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              sortBy === "name"
                ? "bg-primary-500/20 text-primary-300 border border-primary-500/40"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
            }`}
          >
            名称 {sortBy === "name" && (sortOrder === "asc" ? "↑" : "↓")}
          </button>
        </div>
      </div>

      {/* 店铺卡片网格 */}
      {filteredAndSortedStores.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center">
          <Megaphone className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400">
            {searchQuery || filterPlatform !== "all" || filterCountry !== "all" ? "未找到匹配的店铺" : "暂无店铺，请点击右上角「新增店铺」"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAndSortedStores.map((store) => {
            const isHovered = hoveredStoreId === store.id;
            const country = getCountryByCode(store.country);
            return (
              <div
                key={store.id}
                className="group relative overflow-hidden rounded-2xl border p-5 transition-all"
                style={{
                  background: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                  borderRadius: "16px",
                  border: "1px solid rgba(255, 255, 255, 0.1)"
                }}
                onMouseEnter={() => setHoveredStoreId(store.id)}
                onMouseLeave={() => setHoveredStoreId(null)}
              >
                {/* 操作按钮 - 始终显示在右上角 */}
                <div className="absolute top-3 right-3 flex gap-2 z-30">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(store);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors"
                    title="编辑店铺"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(store.id);
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors"
                    title="删除店铺"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* 主卡片内容 */}
                <div className="relative z-0">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-slate-100 mb-1">{store.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/20 px-2 py-0.5 text-xs text-primary-300">
                          <Megaphone className="h-3 w-3" />
                          {store.platform}
                        </span>
                        {country && (
                          <span className="text-xs text-slate-400">{country.code}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {country && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Globe className="h-4 w-4 text-slate-400" />
                        <span>{country.name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-slate-300">
                      <Wallet className="h-4 w-4 text-slate-400" />
                      <span className="text-xs">{store.currency}</span>
                    </div>
                    {store.accountName && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Wallet className="h-4 w-4 text-slate-400" />
                        <span className="text-xs truncate">{store.accountName}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 详情预览（悬停时显示） */}
                {isHovered && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm rounded-2xl p-5 flex flex-col justify-between z-10 overflow-y-auto">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-xs text-slate-400 mb-1">基本信息</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">店铺名称：</span>
                            <span className="text-slate-100">{store.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">所属平台：</span>
                            <span className="text-primary-300">{store.platform}</span>
                          </div>
                          {country && (
                            <div className="flex justify-between">
                              <span className="text-slate-400">国家/站点：</span>
                              <span className="text-slate-100">{country.name} ({country.code})</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-400">经营币种：</span>
                            <span className="text-slate-100">{store.currency}</span>
                          </div>
                        </div>
                      </div>
                      {store.accountName && (
                        <div>
                          <h4 className="text-xs text-slate-400 mb-1">关联账户</h4>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-slate-400">收款账户：</span>
                              <span className="text-slate-100">{store.accountName}</span>
                            </div>
                          </div>
                        </div>
                      )}
                      {(store.vatNumber || store.taxId) && (
                        <div>
                          <h4 className="text-xs text-slate-400 mb-1">税务信息</h4>
                          <div className="space-y-1 text-sm">
                            {store.vatNumber && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">VAT识别号：</span>
                                <span className="text-slate-100">{store.vatNumber}</span>
                              </div>
                            )}
                            {store.taxId && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">税务识别号：</span>
                                <span className="text-slate-100">{store.taxId}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <div>
                        <h4 className="text-xs text-slate-400 mb-1">元数据</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">创建时间：</span>
                            <span className="text-slate-100">{formatDate(store.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {editStore ? "编辑店铺" : "新增店铺"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">关联收款账户后，登记收入时可自动匹配。</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                ✕
              </button>
            </div>

            <form onSubmit={editStore ? handleUpdate : handleCreate} className="space-y-3 text-sm">
              <label className="space-y-1 block">
                <span className="text-slate-300">
                  店铺名称 <span className="text-rose-400">*</span>
                </span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  placeholder="如：TK-UK-01"
                  required
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-300">所属平台</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as Store["platform"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  >
                    <option value="TikTok">TikTok</option>
                    <option value="Amazon">Amazon</option>
                    <option value="其他">其他</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">
                    国家/站点 <span className="text-rose-400">*</span>
                  </span>
                  <select
                    value={form.country}
                    onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    required
                  >
                    <option value="">请选择</option>
                    {Object.entries(countriesByRegion).map(([region, countries]) => (
                      <optgroup key={region} label={region}>
                        {countries.map((country) => (
                          <option key={country.code} value={country.code}>
                            {country.name} ({country.code}) - {country.currency}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">经营币种</span>
                  <input
                    type="text"
                    value={form.currency}
                    readOnly
                    className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 outline-none text-slate-400 cursor-not-allowed"
                  />
                  <div className="text-xs text-slate-500 mt-1">根据国家自动关联</div>
                </label>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-300">VAT/税务识别号</span>
                  <input
                    value={form.vatNumber}
                    onChange={(e) => setForm((f) => ({ ...f, vatNumber: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="欧洲站等需要VAT号"
                  />
                  <div className="text-xs text-slate-500 mt-1">欧洲站等合规要求</div>
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300">税务识别号</span>
                  <input
                    value={form.taxId}
                    onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                    placeholder="其他地区税务识别号"
                  />
                  <div className="text-xs text-slate-500 mt-1">其他地区税务识别</div>
                </label>
              </div>

              <label className="space-y-1 block">
                <span className="text-slate-300">
                  关联收款账户 <span className="text-rose-400">*</span>
                </span>
                <select
                  value={form.accountId}
                  onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
                  required
                >
                  <option value="">请选择</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-primary-600 active:translate-y-px"
                >
                  {editStore ? "保存" : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
