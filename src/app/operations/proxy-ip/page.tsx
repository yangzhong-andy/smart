"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CreditCard, Globe, Package, RefreshCw } from "lucide-react";

interface ProxyIP {
  proxy_id: number;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  city_name: string;
  country_code: string;
  created_at: string;
  expired_at: string;
  order_id: string;
  permissions?: boolean;
  /** 来自 ERP 数据库（万子 API 无此字段） */
  dedicated_line_string?: string;
}

interface CityInventory {
  city_name: string;
  country_code: string;
  number: number;
}

interface CountryCatalogItem {
  continent: string;
  countryCode: string;
  countryName: string;
}

interface CityCatalogItem {
  countryCode: string;
  cityName: string;
}

const COUNTRY_CATALOG: CountryCatalogItem[] = [
  { continent: "北美洲", countryCode: "US", countryName: "美国" },
  { continent: "北美洲", countryCode: "CA", countryName: "加拿大" },
  { continent: "北美洲", countryCode: "MX", countryName: "墨西哥" },
  { continent: "欧洲", countryCode: "GB", countryName: "英国" },
  { continent: "欧洲", countryCode: "FR", countryName: "法国" },
  { continent: "欧洲", countryCode: "DE", countryName: "德国" },
  { continent: "欧洲", countryCode: "IT", countryName: "意大利" },
  { continent: "欧洲", countryCode: "ES", countryName: "西班牙" },
  { continent: "大洋洲", countryCode: "AU", countryName: "澳大利亚" },
  { continent: "亚洲", countryCode: "JP", countryName: "日本" },
  { continent: "亚洲", countryCode: "KR", countryName: "韩国" },
  { continent: "亚洲", countryCode: "SG", countryName: "新加坡" },
  { continent: "亚洲", countryCode: "VN", countryName: "越南" },
  { continent: "亚洲", countryCode: "TH", countryName: "泰国" },
  { continent: "亚洲", countryCode: "PH", countryName: "菲律宾" },
  { continent: "亚洲", countryCode: "ID", countryName: "印度尼西亚" },
  { continent: "亚洲", countryCode: "MY", countryName: "马来西亚" },
  { continent: "亚洲", countryCode: "SA", countryName: "沙特阿拉伯" },
  { continent: "亚洲", countryCode: "AE", countryName: "阿联酋" },
  { continent: "亚洲", countryCode: "IN", countryName: "印度" },
  { continent: "亚洲", countryCode: "TW", countryName: "中国-台湾" },
  { continent: "亚洲", countryCode: "HK", countryName: "中国-香港" },
  { continent: "南美洲", countryCode: "BR", countryName: "巴西" },
  { continent: "南美洲", countryCode: "CL", countryName: "智利" },
  { continent: "南美洲", countryCode: "AR", countryName: "阿根廷" },
  { continent: "非洲", countryCode: "ZA", countryName: "南非" },
];

const COUNTRY_NAME_MAP: Record<string, string> = {
  US: "美国",
  GB: "英国",
  FR: "法国",
  DE: "德国",
  IT: "意大利",
  ES: "西班牙",
  AU: "澳大利亚",
  JP: "日本",
  KR: "韩国",
  SG: "新加坡",
  VN: "越南",
  TH: "泰国",
  PH: "菲律宾",
  ID: "印度尼西亚",
  MY: "马来西亚",
  SA: "沙特阿拉伯",
  AE: "阿联酋",
  IN: "印度",
  TW: "中国-台湾",
  HK: "中国-香港",
  BR: "巴西",
  CL: "智利",
  AR: "阿根廷",
  ZA: "南非",
  CA: "加拿大",
  MX: "墨西哥",
};

const CITY_CATALOG: CityCatalogItem[] = [
  { countryCode: "US", cityName: "Los Angeles" },
  { countryCode: "US", cityName: "Washington" },
  { countryCode: "US", cityName: "New York" },
  { countryCode: "US", cityName: "Atlanta" },
  { countryCode: "US", cityName: "Honolulu" },
  { countryCode: "US", cityName: "Seattle" },
  { countryCode: "US", cityName: "Philadelphia" },
  { countryCode: "US", cityName: "Phoenix" },
  { countryCode: "US", cityName: "Boston" },
  { countryCode: "US", cityName: "Miami" },
  { countryCode: "US", cityName: "San Francisco" },
  { countryCode: "US", cityName: "Chicago" },
  { countryCode: "US", cityName: "Dallas" },
  { countryCode: "US", cityName: "San Jose" },
  { countryCode: "US", cityName: "Austin" },
  { countryCode: "US", cityName: "Charlotte" },
  { countryCode: "US", cityName: "Denver" },
  { countryCode: "US", cityName: "Las Vegas" },
  { countryCode: "US", cityName: "Minneapolis" },
  { countryCode: "US", cityName: "Sacramento" },
  { countryCode: "US", cityName: "Salt Lake City" },
  { countryCode: "US", cityName: "San Antonio" },
  { countryCode: "US", cityName: "San digo" },
  { countryCode: "US", cityName: "Tampa" },
  { countryCode: "CA", cityName: "Toronto" },
  { countryCode: "MX", cityName: "Mexico City" },
  { countryCode: "GB", cityName: "London" },
  { countryCode: "FR", cityName: "Paris" },
  { countryCode: "DE", cityName: "Berlin" },
  { countryCode: "DE", cityName: "Frankfurt" },
  { countryCode: "IT", cityName: "Rome" },
  { countryCode: "IT", cityName: "Milan" },
  { countryCode: "ES", cityName: "Madrid" },
  { countryCode: "AU", cityName: "Melbourne" },
  { countryCode: "AU", cityName: "Sydney" },
  { countryCode: "JP", cityName: "Tokyo" },
  { countryCode: "JP", cityName: "Urayasu" },
  { countryCode: "KR", cityName: "Seoul" },
  { countryCode: "SG", cityName: "Singapore" },
  { countryCode: "VN", cityName: "Hanoi" },
  { countryCode: "VN", cityName: "Ho Chi Minh" },
  { countryCode: "TH", cityName: "Bangkok" },
  { countryCode: "PH", cityName: "Manila" },
  { countryCode: "ID", cityName: "Jakarta" },
  { countryCode: "MY", cityName: "Kuala Lumpur" },
  { countryCode: "SA", cityName: "Riyadh" },
  { countryCode: "AE", cityName: "Dubai" },
  { countryCode: "IN", cityName: "Mumbai" },
  { countryCode: "TW", cityName: "TaiPei" },
  { countryCode: "HK", cityName: "Hong Kong" },
  { countryCode: "HK", cityName: "Hong Kong S" },
  { countryCode: "BR", cityName: "Sao Paulo" },
  { countryCode: "BR", cityName: "Rio de Janeiro" },
  { countryCode: "CL", cityName: "Santiago" },
  { countryCode: "AR", cityName: "Buenos Aires" },
  { countryCode: "ZA", cityName: "Johannesburg" },
];

const MOCK_CREDIT = { Credit: 0, Used: 0, Limit: 0 };
const MOCK_BUSINESSES = ["TikTok", "Amazon", "Google"];
const MOCK_INVENTORY: CityInventory[] = [
  { city_name: "Los Angeles", country_code: "US", number: 49 },
  { city_name: "Hong Kong", country_code: "HK", number: 357 },
  { city_name: "Kuala Lumpur", country_code: "MY", number: 127 },
  { city_name: "Sao Paulo", country_code: "BR", number: 26 },
];
const MOCK_IPS: ProxyIP[] = [
  {
    proxy_id: 11111111,
    username: "test01",
    password: "test01",
    proxy_address: "1.1.1.1",
    port: 7778,
    city_name: "Manila",
    country_code: "PH",
    created_at: "2026-04-10T08:00:00.000Z",
    expired_at: "2026-05-10T08:00:00.000Z",
    order_id: "769uKf",
  },
  {
    proxy_id: 11111112,
    username: "test02",
    password: "test02",
    proxy_address: "1.1.1.2",
    port: 8837,
    city_name: "Kuala Lumpur",
    country_code: "MY",
    created_at: "2026-04-18T08:00:00.000Z",
    expired_at: "2026-05-18T08:00:00.000Z",
    order_id: "124Yyi",
  },
];

export default function ProxyIPPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "purchase" | "list">("dashboard");
  const [selectedBusiness, setSelectedBusiness] = useState<string>(MOCK_BUSINESSES[0]);
  const [proxiesType, setProxiesType] = useState<"Native" | "Broadcast">("Native");
  const [selectedContinent, setSelectedContinent] = useState<string>("ALL");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string>("ALL");
  const [selectedCityName, setSelectedCityName] = useState<string>("ALL");
  const [rowPurchaseCount, setRowPurchaseCount] = useState<Record<string, number>>({});
  const [expiringDays, setExpiringDays] = useState<number | "">("");

  const [credit, setCredit] = useState(MOCK_CREDIT);
  const [businesses, setBusinesses] = useState<string[]>(MOCK_BUSINESSES);
  const [inventory, setInventory] = useState<CityInventory[]>(MOCK_INVENTORY);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [myIPs, setMyIPs] = useState<ProxyIP[]>(MOCK_IPS);
  const [editingProxyId, setEditingProxyId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [changingUserPass, setChangingUserPass] = useState(false);
  const [dedicatedPullMap, setDedicatedPullMap] = useState<Record<number, boolean>>({});
  /** 专线拉取为「是」时编辑的专线代理串（点「保存」后写入数据库） */
  const [dedicatedLineStringMap, setDedicatedLineStringMap] = useState<Record<number, string>>({});
  const [savingDedicatedLineProxyId, setSavingDedicatedLineProxyId] = useState<number | null>(null);

  const saveDedicatedLineToDb = useCallback(async (proxyId: number, value: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/proxy-ip/dedicated-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy_id: proxyId, dedicated_line_string: value }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json?.success) throw new Error(json?.error || "保存失败");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "专线代理串保存失败");
      return false;
    }
  }, []);

  const commitDedicatedLine = useCallback(
    async (ip: ProxyIP) => {
      const value = dedicatedLineStringMap[ip.proxy_id] ?? "";
      setSavingDedicatedLineProxyId(ip.proxy_id);
      try {
        const ok = await saveDedicatedLineToDb(ip.proxy_id, value);
        if (ok) {
          setMyIPs((prev) =>
            prev.map((p) => (p.proxy_id === ip.proxy_id ? { ...p, dedicated_line_string: value } : p))
          );
          toast.success("已保存");
        }
      } finally {
        setSavingDedicatedLineProxyId(null);
      }
    },
    [dedicatedLineStringMap, saveDedicatedLineToDb]
  );

  const continentOptions = useMemo(() => {
    return Array.from(new Set(COUNTRY_CATALOG.map((item) => item.continent)));
  }, []);
  const countryOptions = useMemo(() => {
    const source =
      selectedContinent === "ALL"
        ? COUNTRY_CATALOG
        : COUNTRY_CATALOG.filter((item) => item.continent === selectedContinent);
    return source.map((item) => ({
      code: item.countryCode,
      name: item.countryName,
      continent: item.continent,
    }));
  }, [selectedContinent]);
  const cityOptions = useMemo(() => {
    const source =
      selectedCountryCode === "ALL"
        ? CITY_CATALOG.filter((item) =>
            selectedContinent === "ALL"
              ? true
              : COUNTRY_CATALOG.some(
                  (country) =>
                    country.countryCode === item.countryCode && country.continent === selectedContinent
                )
          )
        : CITY_CATALOG.filter((item) => item.countryCode === selectedCountryCode);
    return source.map((item) => ({
      cityName: item.cityName,
      countryCode: item.countryCode,
    }));
  }, [selectedContinent, selectedCountryCode]);
  const filteredInventory = useMemo(() => {
    let result = inventory;
    if (selectedCityName !== "ALL") {
      result = result.filter((item) => item.city_name === selectedCityName);
    }
    if (selectedCountryCode !== "ALL") {
      result = result.filter((item) => item.country_code === selectedCountryCode);
    } else if (selectedContinent !== "ALL") {
      const codeSet = new Set(
        COUNTRY_CATALOG.filter((item) => item.continent === selectedContinent).map((item) => item.countryCode)
      );
      result = result.filter((item) => codeSet.has(item.country_code));
    }
    return result;
  }, [inventory, selectedCityName, selectedCountryCode, selectedContinent]);

  const expiringSoonCount = useMemo(
    () =>
      myIPs.filter((ip) => {
        const days = (new Date(ip.expired_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        return days > 0 && days < 7;
      }).length,
    [myIPs]
  );

  const handlePurchase = (cityName: string, count = 1) => {
    const confirmed = window.confirm(`确认购买 ${cityName} 的代理IP，数量 ${count} 个？`);
    if (!confirmed) {
      toast.info("已取消购买");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/proxy-ip/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proxies_type: proxiesType,
            purpose_web: selectedBusiness,
            city_name: cityName,
            count,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || "购买失败");
        toast.success("购买成功");
        await Promise.all([loadCredit(), loadInventory(), loadMyIPs()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "购买失败");
      }
    })();
  };
  const getRowCount = (rowKey: string) => rowPurchaseCount[rowKey] ?? 1;

  const handleRenew = (proxyId: number) => {
    const confirmed = window.confirm(`确认续费 Proxy ID: ${proxyId} 吗？`);
    if (!confirmed) {
      toast.info("已取消续费");
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/proxy-ip/renew", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proxy_ids: [proxyId] }),
        });
        const json = await res.json();
        if (!res.ok || !json?.success) throw new Error(json?.error || "续费失败");
        toast.success("续费成功");
        await Promise.all([loadCredit(), loadMyIPs()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "续费失败");
      }
    })();
  };
  const startEditUserPass = (ip: ProxyIP) => {
    setEditingProxyId(ip.proxy_id);
    setNewUsername(ip.username);
    setNewPassword(ip.password);
  };
  const cancelEditUserPass = () => {
    setEditingProxyId(null);
    setNewUsername("");
    setNewPassword("");
  };
  const handleChangeUserPass = async (proxyId: number) => {
    const username = newUsername.trim();
    const password = newPassword.trim();
    if (!username || !password) {
      toast.error("用户名和密码都不能为空");
      return;
    }
    const confirmed = window.confirm(`确认修改 Proxy ID: ${proxyId} 的用户名和密码吗？`);
    if (!confirmed) {
      toast.info("已取消修改");
      return;
    }
    setChangingUserPass(true);
    try {
      // 对应文档 5: OpenApiUserPass
      // 请求字段: proxy_ids(array), username, password
      const res = await fetch("/api/proxy-ip/userpass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxy_ids: [proxyId],
          username,
          password,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "更换账号密码失败");
      setMyIPs((prev) =>
        prev.map((item) =>
          item.proxy_id === proxyId
            ? {
                ...item,
                username,
                password,
              }
            : item
        )
      );
      toast.success("用户名/密码已更新");
      cancelEditUserPass();
    } catch (error) {
      const message = error instanceof Error ? error.message : "更换账号密码失败";
      toast.error(message);
    } finally {
      setChangingUserPass(false);
    }
  };

  const loadCredit = async () => {
    const res = await fetch("/api/proxy-ip/credit", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "获取余额失败");
    setCredit(json.data);
  };

  const loadBusinesses = async () => {
    const res = await fetch("/api/proxy-ip/business", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || "获取业务场景失败");
    const list = (json.data as Array<{ BusinessName?: string }>).map((x) => x.BusinessName || "").filter(Boolean);
    setBusinesses(list);
    if (list.length > 0) setSelectedBusiness((prev) => (list.includes(prev) ? prev : list[0]));
  };

  const loadInventory = async () => {
    if (!selectedBusiness) return;
    setLoadingInventory(true);
    try {
      const res = await fetch("/api/proxy-ip/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxies_type: proxiesType,
          purpose_web: selectedBusiness,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "获取库存失败");
      setInventory(json.data?.country_list || []);
    } finally {
      setLoadingInventory(false);
    }
  };

  const loadMyIPs = async () => {
    setLoadingList(true);
    try {
      const payload: Record<string, unknown> = { proxies_type: proxiesType };
      if (selectedCityName !== "ALL") payload.city_name = selectedCityName;
      if (expiringDays !== "") payload.expiring_days = expiringDays;
      const res = await fetch("/api/proxy-ip/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "获取IP列表失败");
      setMyIPs(json.data?.results || []);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([loadCredit(), loadBusinesses()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "初始化失败");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedBusiness) return;
    void loadInventory().catch((e) => toast.error(e instanceof Error ? e.message : "查询库存失败"));
  }, [selectedBusiness, proxiesType]);

  useEffect(() => {
    if (activeTab !== "list") return;
    void loadMyIPs().catch((e) => toast.error(e instanceof Error ? e.message : "获取IP列表失败"));
  }, [activeTab, proxiesType, selectedCityName, expiringDays]);

  useEffect(() => {
    setDedicatedPullMap((prev) => {
      const next = { ...prev };
      for (const ip of myIPs) {
        if (next[ip.proxy_id] === undefined) {
          next[ip.proxy_id] = Boolean(ip.permissions);
        }
      }
      return next;
    });
  }, [myIPs]);

  useEffect(() => {
    setDedicatedLineStringMap(() => {
      const next: Record<number, string> = {};
      for (const ip of myIPs) {
        next[ip.proxy_id] = ip.dedicated_line_string ?? "";
      }
      return next;
    });
  }, [myIPs]);

  return (
    <div className="p-6 space-y-6 text-slate-200">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-100">
          <Globe className="w-6 h-6" />
          代理IP管理
        </h1>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm text-slate-500">账户余额(USD)</div>
            <div className="text-xl font-bold text-emerald-300">${credit.Limit.toFixed(2)}</div>
          </div>
          <button
            onClick={() => toast.info("文档未提供充值接口，请接供应商后台充值页面")}
            className="h-9 px-3 rounded-md bg-emerald-600/90 text-white text-sm hover:bg-emerald-600"
            title="充值"
          >
            充值
          </button>
          <button
            onClick={() => void loadCredit().catch((e) => toast.error(e instanceof Error ? e.message : "刷新失败"))}
            className="p-2 hover:bg-slate-800 rounded"
            title="刷新余额"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 text-cyan-200 text-sm px-4 py-2">
        当前页面已接入服务端代理 API，前端不直接暴露万子 Token。
      </div>

      <div className="flex gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`px-4 py-2 ${activeTab === "dashboard" ? "border-b-2 border-cyan-400 text-cyan-300" : "text-slate-400"}`}
        >
          概览
        </button>
        <button
          onClick={() => setActiveTab("purchase")}
          className={`px-4 py-2 ${activeTab === "purchase" ? "border-b-2 border-cyan-400 text-cyan-300" : "text-slate-400"}`}
        >
          购买IP
        </button>
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2 ${activeTab === "list" ? "border-b-2 border-cyan-400 text-cyan-300" : "text-slate-400"}`}
        >
          我的IP
        </button>
      </div>

      {activeTab === "dashboard" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <CreditCard className="w-4 h-4" />
              账户余额
            </div>
            <div className="text-2xl font-bold text-slate-100">${credit.Limit.toFixed(2)}</div>
            <div className="text-sm text-slate-500 mt-1">已用: ${credit.Used.toFixed(2)}</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Package className="w-4 h-4" />
              当前IP数
            </div>
            <div className="text-2xl font-bold text-slate-100">{myIPs.length}</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <AlertCircle className="w-4 h-4" />
              即将过期
            </div>
            <div className="text-2xl font-bold text-slate-100">{expiringSoonCount}</div>
          </div>
        </div>
      )}

      {activeTab === "purchase" && (
        <div className="space-y-4">
          <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">IP类型</label>
                <select
                  value={proxiesType}
                  onChange={(e) => setProxiesType(e.target.value as "Native" | "Broadcast")}
                  className="border border-slate-700 bg-slate-950 rounded px-3 py-2"
                >
                  <option value="Native">原生IP</option>
                  <option value="Broadcast">广播IP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">业务场景</label>
                <select
                  value={selectedBusiness}
                  onChange={(e) => setSelectedBusiness(e.target.value)}
                  className="border border-slate-700 bg-slate-950 rounded px-3 py-2 min-w-[200px]"
                >
                  {businesses.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">大洲</label>
                <select
                  value={selectedContinent}
                  onChange={(e) => {
                    setSelectedContinent(e.target.value);
                    setSelectedCountryCode("ALL");
                    setSelectedCityName("ALL");
                  }}
                  className="border border-slate-700 bg-slate-950 rounded px-3 py-2 min-w-[160px]"
                >
                  <option value="ALL">全部大洲</option>
                  {continentOptions.map((continent) => (
                    <option key={continent} value={continent}>
                      {continent}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">国家（按文档 Code）</label>
                <select
                  value={selectedCountryCode}
                  onChange={(e) => {
                    setSelectedCountryCode(e.target.value);
                    setSelectedCityName("ALL");
                  }}
                  className="border border-slate-700 bg-slate-950 rounded px-3 py-2 min-w-[220px]"
                >
                  <option value="ALL">全部国家</option>
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name} ({country.code}) {selectedContinent === "ALL" ? `- ${country.continent}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">城市（按文档）</label>
                <select
                  value={selectedCityName}
                  onChange={(e) => setSelectedCityName(e.target.value)}
                  className="border border-slate-700 bg-slate-950 rounded px-3 py-2 min-w-[220px]"
                >
                  <option value="ALL">全部城市</option>
                  {cityOptions.map((city) => (
                    <option key={`${city.countryCode}-${city.cityName}`} value={city.cityName}>
                      {city.cityName} ({city.countryCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() =>
                    void loadInventory().catch((e) => toast.error(e instanceof Error ? e.message : "查询库存失败"))
                  }
                  className="bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700 disabled:opacity-50"
                  disabled={loadingInventory}
                >
                  {loadingInventory ? "查询中..." : "查询库存"}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-950/80">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">国家</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">城市</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">库存</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((city) => (
                  <tr key={`${city.country_code}-${city.city_name}`} className="border-t border-slate-800">
                    <td className="px-4 py-3">
                      {COUNTRY_NAME_MAP[city.country_code] || city.country_code} ({city.country_code})
                    </td>
                    <td className="px-4 py-3">{city.city_name}</td>
                    <td className="px-4 py-3">{city.number}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={getRowCount(`${city.country_code}-${city.city_name}`)}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setRowPurchaseCount((prev) => ({
                              ...prev,
                              [`${city.country_code}-${city.city_name}`]:
                                Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1,
                            }));
                          }}
                          className="border border-slate-700 bg-slate-950 rounded px-2 py-1 w-[74px] text-sm"
                        />
                        <button
                          onClick={() =>
                            handlePurchase(
                              city.city_name,
                              getRowCount(`${city.country_code}-${city.city_name}`)
                            )
                          }
                          disabled={city.number === 0 || getRowCount(`${city.country_code}-${city.city_name}`) <= 0}
                          className="bg-cyan-600 text-white px-3 py-1 rounded text-sm hover:bg-cyan-700 disabled:opacity-50"
                        >
                          购买
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInventory.length === 0 && (
                  <tr className="border-t border-slate-800">
                    <td className="px-4 py-6 text-slate-500 text-center" colSpan={4}>
                      当前国家暂无库存演示数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-slate-100">已购IP列表</h2>
            <div className="flex items-end gap-2">
              <div>
                <label className="block text-xs text-slate-400 mb-1">剩余到期天数</label>
                <input
                  type="number"
                  min={1}
                  value={expiringDays}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "") {
                      setExpiringDays("");
                      return;
                    }
                    const parsed = Number(value);
                    setExpiringDays(Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : "");
                  }}
                  className="border border-slate-700 bg-slate-950 rounded px-2 py-1 w-[120px] text-sm"
                  placeholder="如 7"
                />
              </div>
              <button
                onClick={() => void loadMyIPs().catch((e) => toast.error(e instanceof Error ? e.message : "刷新失败"))}
                className="flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
                disabled={loadingList}
              >
                <RefreshCw className="w-4 h-4" />
                {loadingList ? "刷新中..." : "刷新"}
              </button>
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-950/80">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">国家</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">城市</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">代理串</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">IP</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">端口</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">账号</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">密码</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">购买时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">到期时间</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">专线拉取</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {myIPs.map((ip) => {
                  const days = Math.ceil((new Date(ip.expired_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const dedicatedDraft = dedicatedLineStringMap[ip.proxy_id] ?? "";
                  const dedicatedSaved = ip.dedicated_line_string ?? "";
                  const dedicatedUnchanged = dedicatedDraft === dedicatedSaved;
                  const savingDedicatedLine = savingDedicatedLineProxyId === ip.proxy_id;
                  return (
                    <Fragment key={ip.proxy_id}>
                      <tr className="border-t border-slate-800">
                        <td className="px-4 py-3">
                          {COUNTRY_NAME_MAP[ip.country_code] || ip.country_code} ({ip.country_code})
                        </td>
                        <td className="px-4 py-3">{ip.city_name}</td>
                        <td className="px-4 py-3 font-mono text-sm align-top">
                          <div className="flex flex-col gap-2 min-w-[200px] max-w-[360px]">
                            <div className="break-all">
                              {`${ip.proxy_address}:${ip.port}:${ip.username}:${ip.password}`}
                            </div>
                            {dedicatedPullMap[ip.proxy_id] ? (
                              <div className="font-sans">
                                <div className="text-[10px] text-slate-500 mb-1">专线代理串</div>
                                <textarea
                                  value={dedicatedDraft}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setDedicatedLineStringMap((prev) => ({
                                      ...prev,
                                      [ip.proxy_id]: v,
                                    }));
                                  }}
                                  rows={2}
                                  placeholder="请粘贴专线代理串，填写后点保存写入数据库"
                                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-mono text-slate-100 outline-none focus:border-cyan-500/60"
                                />
                                <button
                                  type="button"
                                  disabled={dedicatedUnchanged || savingDedicatedLine}
                                  onClick={() => void commitDedicatedLine(ip)}
                                  className="mt-1.5 rounded bg-cyan-700/90 px-2 py-1 text-[11px] text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {savingDedicatedLine ? "保存中…" : "保存"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">{ip.proxy_address}</td>
                        <td className="px-4 py-3">{ip.port}</td>
                        <td className="px-4 py-3">{ip.username}</td>
                        <td className="px-4 py-3">{ip.password}</td>
                        <td className="px-4 py-3">
                          {new Date(ip.created_at).toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">{new Date(ip.expired_at).toLocaleString("zh-CN")}</div>
                          <div className={`text-xs ${days < 7 ? "text-rose-400" : days < 30 ? "text-amber-300" : "text-emerald-300"}`}>
                            {days > 0 ? `${days}天后到期` : "已过期"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="inline-flex rounded-md bg-slate-800/80 p-1">
                            <button
                              type="button"
                              onClick={() =>
                                setDedicatedPullMap((prev) => ({
                                  ...prev,
                                  [ip.proxy_id]: true,
                                }))
                              }
                              className={`px-2.5 py-1 text-xs rounded transition-all ${
                                dedicatedPullMap[ip.proxy_id]
                                  ? "bg-emerald-500 text-white"
                                  : "text-slate-300 hover:text-white"
                              }`}
                            >
                              是
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void (async () => {
                                  const ok = await saveDedicatedLineToDb(ip.proxy_id, "");
                                  if (!ok) return;
                                  setDedicatedPullMap((prev) => ({
                                    ...prev,
                                    [ip.proxy_id]: false,
                                  }));
                                  setDedicatedLineStringMap((prev) => {
                                    const next = { ...prev };
                                    delete next[ip.proxy_id];
                                    return next;
                                  });
                                  setMyIPs((prev) =>
                                    prev.map((p) =>
                                      p.proxy_id === ip.proxy_id ? { ...p, dedicated_line_string: "" } : p
                                    )
                                  );
                                })();
                              }}
                              className={`px-2.5 py-1 text-xs rounded transition-all ${
                                !dedicatedPullMap[ip.proxy_id]
                                  ? "bg-slate-600 text-white"
                                  : "text-slate-300 hover:text-white"
                              }`}
                            >
                              否
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRenew(ip.proxy_id)}
                              className="bg-emerald-600 text-white px-3 py-1 rounded text-sm hover:bg-emerald-700"
                            >
                              续费
                            </button>
                            <button
                              onClick={() => startEditUserPass(ip)}
                              className="bg-cyan-600 text-white px-3 py-1 rounded text-sm hover:bg-cyan-700"
                            >
                              更换账号密码
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingProxyId === ip.proxy_id && (
                        <tr className="border-t border-slate-800 bg-slate-950/40">
                          <td className="px-4 py-3 text-slate-400 text-sm" colSpan={11}>
                            <div className="flex flex-wrap items-end gap-3">
                              <div>
                                <label className="block text-xs text-slate-400 mb-1">新用户名</label>
                                <input
                                  value={newUsername}
                                  onChange={(e) => setNewUsername(e.target.value)}
                                  className="border border-slate-700 bg-slate-950 rounded px-3 py-1.5 min-w-[160px]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-400 mb-1">新密码</label>
                                <input
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  className="border border-slate-700 bg-slate-950 rounded px-3 py-1.5 min-w-[160px]"
                                />
                              </div>
                              <button
                                onClick={() => handleChangeUserPass(ip.proxy_id)}
                                disabled={changingUserPass}
                                className="bg-cyan-600 text-white px-3 py-1.5 rounded text-sm hover:bg-cyan-700 disabled:opacity-50"
                              >
                                {changingUserPass ? "提交中..." : "确认更换"}
                              </button>
                              <button
                                onClick={cancelEditUserPass}
                                disabled={changingUserPass}
                                className="bg-slate-700 text-white px-3 py-1.5 rounded text-sm hover:bg-slate-600 disabled:opacity-50"
                              >
                                取消
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
