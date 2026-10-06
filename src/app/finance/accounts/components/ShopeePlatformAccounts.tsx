"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Clock3,
  Megaphone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  WalletCards,
} from "lucide-react";

export type ShopeePlatformShop = {
  id: string;
  shopId: string;
  shopName: string | null;
  region: string;
  currency: string | null;
  store: { id: string; name: string } | null;
};

export type ShopeePlatformWallet = {
  id: string;
  walletType: "STORE" | "ADVERTISING";
  name: string;
  currency: string;
  balance: number;
  enabled: boolean;
  updatedAt: string;
  officialBalanceLastSyncAt: string | null;
  latestOfficialBalanceAt: string | null;
  shopSetting: { shopId: string; shopName: string | null; region: string };
};

export type ShopeePlatformWithdrawal = {
  id: string;
  amount: number;
  currency: string;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  requestedAt: string;
  expectedAt: string | null;
  shopSetting: { shopId: string; shopName: string | null };
  destinationAccount: { id: string; name: string; accountNumber: string | null } | null;
};

type Props = {
  shops: ShopeePlatformShop[];
  wallets: ShopeePlatformWallet[];
  withdrawals: ShopeePlatformWithdrawal[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

type NativeBalance = { currency: string; amount: number };

type ShopGroup = {
  key: string;
  shopId: string;
  shopName: string;
  region: string;
  wallets: ShopeePlatformWallet[];
  withdrawals: ShopeePlatformWithdrawal[];
  balances: NativeBalance[];
};

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency === "RMB" ? "CNY" : currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);

const dateTime = (value: string | null | undefined) => {
  if (!value) return "尚未同步";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未同步";
  return date.toLocaleString("zh-CN", { hour12: false });
};

function sumByCurrency(items: Array<{ amount: number; currency: string }>) {
  const totals = new Map<string, number>();
  for (const item of items) {
    const currency = item.currency === "RMB" ? "CNY" : item.currency;
    totals.set(currency, (totals.get(currency) || 0) + (Number(item.amount) || 0));
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function balanceText(balances: NativeBalance[]) {
  return balances.length > 0
    ? balances.map((balance) => money(balance.amount, balance.currency)).join(" · ")
    : "暂无资金";
}

export function ShopeePlatformAccounts({ shops, wallets, withdrawals, loading, error, onRefresh }: Props) {
  const [keyword, setKeyword] = useState("");
  const [collapsedShopIds, setCollapsedShopIds] = useState<Set<string>>(new Set());
  const enabledWallets = useMemo(() => wallets.filter((wallet) => wallet.enabled), [wallets]);
  const inTransit = useMemo(() => withdrawals.filter((withdrawal) => withdrawal.status === "IN_TRANSIT"), [withdrawals]);

  const shopGroups = useMemo<ShopGroup[]>(() => {
    const groups = new Map<string, ShopGroup>();
    for (const shop of shops) {
      groups.set(shop.shopId, {
        key: shop.id,
        shopId: shop.shopId,
        shopName: shop.shopName || shop.store?.name || shop.shopId,
        region: shop.region,
        wallets: [],
        withdrawals: [],
        balances: [],
      });
    }
    for (const wallet of enabledWallets) {
      const shopId = wallet.shopSetting.shopId;
      if (!groups.has(shopId)) {
        groups.set(shopId, {
          key: shopId,
          shopId,
          shopName: wallet.shopSetting.shopName || shopId,
          region: wallet.shopSetting.region,
          wallets: [],
          withdrawals: [],
          balances: [],
        });
      }
      groups.get(shopId)!.wallets.push(wallet);
    }
    for (const withdrawal of inTransit) {
      const shopId = withdrawal.shopSetting.shopId;
      if (!groups.has(shopId)) {
        groups.set(shopId, {
          key: shopId,
          shopId,
          shopName: withdrawal.shopSetting.shopName || shopId,
          region: "",
          wallets: [],
          withdrawals: [],
          balances: [],
        });
      }
      groups.get(shopId)!.withdrawals.push(withdrawal);
    }
    for (const group of groups.values()) {
      group.wallets.sort((a, b) => a.walletType.localeCompare(b.walletType) || a.name.localeCompare(b.name, "zh-CN"));
      group.balances = sumByCurrency([
        ...group.wallets.map((wallet) => ({ amount: wallet.balance, currency: wallet.currency })),
        ...group.withdrawals.map((withdrawal) => ({ amount: withdrawal.amount, currency: withdrawal.currency })),
      ]);
    }
    return [...groups.values()].sort((a, b) => a.shopName.localeCompare(b.shopName, "zh-CN"));
  }, [shops, enabledWallets, inTransit]);

  const visibleGroups = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return shopGroups;
    return shopGroups.filter((group) =>
      [group.shopName, group.shopId, group.region, ...group.wallets.map((wallet) => wallet.name)]
        .some((value) => String(value || "").toLowerCase().includes(query)),
    );
  }, [shopGroups, keyword]);

  const toggleShop = (shopId: string) => {
    setCollapsedShopIds((current) => {
      const next = new Set(current);
      if (next.has(shopId)) next.delete(shopId);
      else next.add(shopId);
      return next;
    });
  };

  const collapseAll = () => setCollapsedShopIds(new Set(shopGroups.map((group) => group.shopId)));
  const expandAll = () => setCollapsedShopIds(new Set());

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-500/20 bg-slate-900/65 shadow-xl shadow-black/10">
      <div className="border-b border-slate-800 bg-gradient-to-r from-orange-500/[0.08] via-slate-900/30 to-slate-900/30 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-500/10 p-2.5 text-orange-300"><WalletCards className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">平台账户 · Shopee</h2>
                <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-300">公司资产</span>
                <span className="rounded-full border border-slate-700 bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-400">平台只读</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">按店铺独立核算；平台资金与银行账户分账管理，不进入付款账户选择器。</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />刷新余额
            </button>
            <a href="/platforms/shopee/wallets" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-300 transition hover:bg-orange-500/15">管理钱包 <ArrowRight className="h-3.5 w-3.5" /></a>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-3 gap-2 text-center sm:flex sm:text-left">
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2"><div className="text-[10px] text-slate-500">店铺</div><div className="mt-0.5 text-sm font-semibold text-slate-200">{shopGroups.length}</div></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2"><div className="text-[10px] text-slate-500">钱包</div><div className="mt-0.5 text-sm font-semibold text-slate-200">{enabledWallets.length}</div></div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2"><div className="text-[10px] text-slate-500">在途笔数</div><div className="mt-0.5 text-sm font-semibold text-amber-200">{inTransit.length}</div></div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block min-w-0 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索店铺、店铺ID或钱包" className="w-full rounded-lg border border-slate-700 bg-slate-950/60 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-500/50" />
            </label>
            <div className="flex rounded-lg border border-slate-700 bg-slate-950/50 p-0.5 text-xs">
              <button type="button" onClick={expandAll} className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">全部展开</button>
              <button type="button" onClick={collapseAll} className="rounded-md px-3 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">全部收起</button>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="px-5 py-8 text-center text-sm text-rose-300">平台账户加载失败：{error}</div>
      ) : loading && shopGroups.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">正在加载 Shopee 平台账户…</div>
      ) : shopGroups.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">尚未接入 Shopee 店铺</div>
      ) : visibleGroups.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">没有找到匹配的店铺或钱包</div>
      ) : (
        <div className="space-y-3 p-4">
          {visibleGroups.map((group) => {
            const collapsed = !keyword.trim() && collapsedShopIds.has(group.shopId);
            const storeWallets = group.wallets.filter((wallet) => wallet.walletType === "STORE");
            const advertisingWallets = group.wallets.filter((wallet) => wallet.walletType === "ADVERTISING");
            const withdrawalBalances = sumByCurrency(group.withdrawals.map((withdrawal) => ({ amount: withdrawal.amount, currency: withdrawal.currency })));
            return (
              <article key={group.key} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/25">
                <button type="button" onClick={() => toggleShop(group.shopId)} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-slate-800/30">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="rounded-lg bg-orange-500/10 p-2 text-orange-300">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold text-slate-100">{group.shopName}</span><span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{group.shopId}</span>{group.region && <span className="text-[10px] uppercase text-slate-600">{group.region}</span>}</div>
                      <div className="mt-1 text-[11px] text-slate-500">店铺钱包 {storeWallets.length} · 广告钱包 {advertisingWallets.length} · 在途 {group.withdrawals.length} 笔</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right"><div className="text-[10px] text-slate-500">本店平台资金</div><div className="mt-0.5 text-sm font-semibold text-slate-200">{balanceText(group.balances)}</div></div>
                </button>

                {!collapsed && (
                  <div className="grid gap-3 border-t border-slate-800 p-3 md:grid-cols-2 xl:grid-cols-3">
                    {group.wallets.map((wallet) => {
                      const isStore = wallet.walletType === "STORE";
                      const syncedAt = wallet.officialBalanceLastSyncAt || wallet.latestOfficialBalanceAt || wallet.updatedAt;
                      return (
                        <a key={wallet.id} href="/platforms/shopee/wallets" className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-lg ${isStore ? "border-blue-500/20 bg-blue-500/[0.045] hover:border-blue-500/35" : "border-violet-500/20 bg-violet-500/[0.045] hover:border-violet-500/35"}`}>
                          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2 text-xs text-slate-400">{isStore ? <Store className="h-3.5 w-3.5 text-blue-300" /> : <Megaphone className="h-3.5 w-3.5 text-violet-300" />}{isStore ? "店铺钱包" : "广告钱包"}</div><div className="mt-2 truncate text-sm font-medium text-slate-100">{wallet.name}</div></div><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400/70" /></div>
                          <div className="mt-5 text-2xl font-semibold tracking-tight text-slate-100">{money(wallet.balance, wallet.currency)}</div>
                          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><RefreshCw className="h-3 w-3" />最近同步：{dateTime(syncedAt)}</div>
                        </a>
                      );
                    })}

                    {group.withdrawals.length > 0 && (
                      <a href="/platforms/shopee/wallets" className="rounded-xl border border-amber-500/20 bg-amber-500/[0.045] p-4 transition hover:-translate-y-0.5 hover:border-amber-500/35 hover:shadow-lg">
                        <div className="flex items-center gap-2 text-xs text-amber-300/80"><Clock3 className="h-3.5 w-3.5" />提现在途 · {group.withdrawals.length} 笔</div>
                        <div className="mt-5 text-2xl font-semibold tracking-tight text-amber-100">{balanceText(withdrawalBalances)}</div>
                        <div className="mt-2 truncate text-[11px] text-slate-500">最近发起：{dateTime(group.withdrawals[0]?.requestedAt)}</div>
                      </a>
                    )}

                    {group.wallets.length === 0 && group.withdrawals.length === 0 && (
                      <a href="/platforms/shopee/wallets" className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/30 px-4 text-center text-xs text-slate-500 transition hover:border-orange-500/30 hover:text-orange-300"><WalletCards className="mb-2 h-5 w-5" />该店铺尚未创建钱包，点击前往配置</a>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
