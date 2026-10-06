"use client";

import { useState, useEffect, useMemo, useRef, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, CreditCard, Wallet, WalletCards, Globe, Calculator, List, Pencil, Trash2, Info, Settings, GripVertical, FolderKanban, Plus, X, Check, ArrowUp, ArrowDown } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import type { BankAccount } from "./types";
import { COUNTRIES, getCountryByCode } from "@/lib/country-config";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  ALL_ACCOUNT_GROUP_ID as ALL_GROUP_ID, UNGROUPED_ACCOUNT_GROUP_ID,
  DEFAULT_ACCOUNT_GROUPS, createDefaultAccountLayout, normalizeAccountLayout,
  getAccountGroupId, deleteAccountGroup, moveAccountGroup,
  type AccountGroup, type AccountGroupState, type AccountLayoutState,
} from "@/lib/account-groups";

const CURRENCY_STORAGE_KEY = "account-cards-currency-visibility";
const ORDER_STORAGE_KEY = "account-cards-order";
const GROUPS_STORAGE_KEY = "account-cards-groups";
const SELECTED_GROUP_STORAGE_KEY = "account-cards-selected-group";
const ACCOUNT_DRAG_TYPE = "application/x-smart-erp-account";
const GROUP_DRAG_TYPE = "application/x-smart-erp-account-group";

function loadAccountGroups(): AccountGroupState {
  if (typeof window === "undefined") return createDefaultAccountLayout();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GROUPS_STORAGE_KEY) || "null");
    if (parsed && Array.isArray(parsed.groups) && parsed.assignments && typeof parsed.assignments === "object") {
      return normalizeAccountLayout(parsed);
    }
  } catch {}
  return createDefaultAccountLayout();
}

function saveAccountGroups(state: AccountGroupState) {
  try { window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loadAccountLayoutFromServer(): Promise<{
  state: AccountGroupState;
  accountOrder: string[];
  exists: boolean;
  canEdit: boolean;
} | null> {
  try {
    const response = await fetch("/api/account-groups", { headers: authHeaders(), cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    const state = data?.state;
    if (!state || !Array.isArray(state.groups) || !state.assignments || typeof state.assignments !== "object") return null;
    return {
      state: normalizeAccountLayout(state),
      accountOrder: normalizeAccountLayout(state).accountOrder,
      exists: Boolean(data.exists),
      canEdit: Boolean(data.canEdit),
    };
  } catch {
    return null;
  }
}

async function saveAccountLayoutToServer(state: AccountLayoutState): Promise<AccountLayoutState> {
  const response = await fetch("/api/account-groups", {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !body?.state) throw new Error(body?.error || "保存分组和排序失败，请稍后重试");
  return normalizeAccountLayout(body.state);
}

function loadSelectedGroup() {
  if (typeof window === "undefined") return ALL_GROUP_ID;
  try { return window.localStorage.getItem(SELECTED_GROUP_STORAGE_KEY) || ALL_GROUP_ID; } catch { return ALL_GROUP_ID; }
}

function saveSelectedGroup(groupId: string) {
  try { window.localStorage.setItem(SELECTED_GROUP_STORAGE_KEY, groupId); } catch {}
}

// 从 localStorage 读取（fallback）
function loadHiddenFromLocal(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

// 从数据库 API 读取（优先），失败回退 localStorage
async function loadHiddenCurrencies(): Promise<Set<string>> {
  try {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return loadHiddenFromLocal();
    const res = await fetch("/api/users/me/preferences", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return loadHiddenFromLocal();
    const data = await res.json();
    const hidden = data?.preferences?.accounts?.hiddenCurrencies;
    if (Array.isArray(hidden)) return new Set(hidden);
  } catch {}
  return loadHiddenFromLocal();
}

// 保存到数据库 + localStorage（双写）
async function saveHiddenCurrencies(hidden: Set<string>): Promise<void> {
  const arr = Array.from(hidden);
  try { window.localStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(arr)); } catch {}
  try {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return;
    await fetch("/api/users/me/preferences", {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: { hiddenCurrencies: arr } }),
    });
  } catch {}
}

function loadAccountOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = window.localStorage.getItem(ORDER_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function saveAccountOrder(order: string[]) {
  try { window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order)); } catch {}
}

const currency = (n: number, curr: string = "CNY") =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: curr, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0
  );

const formatNumber = (n: number) => {
  if (!Number.isFinite(n)) return "0.00";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const formatAccountNumber = (accountNumber: string | undefined): string => {
  if (!accountNumber) return "-";
  if (accountNumber.length <= 4) return accountNumber;
  return `****${accountNumber.slice(-4)}`;
};

function getAccountIcon(account: BankAccount) {
  if (account.accountCategory === "PRIMARY") return Building2;
  if (account.accountPurpose?.includes("回款") || account.accountPurpose?.includes("收款")) return Wallet;
  return CreditCard;
}

type CountryLike = { name: string; code: string };
type StoreLike = { id: string; name: string; country: string; platform?: string; currency?: string };

type AccountsTableProps = {
  accounts: BankAccount[];
  allAccounts: BankAccount[];
  storesList: StoreLike[];
  accountTrendData: Record<string, Array<{ date: string; balance: number }>>;
  exchangeRates: { USD: number; JPY: number; BRL?: number } | null;
  hoveredAccountId: string | null;
  setHoveredAccountId: (id: string | null) => void;
  onViewFlow: (account: BankAccount) => void;
  onEdit: (account: BankAccount) => void;
  onDelete: (id: string) => void;
  onViewDetail?: (account: BankAccount) => void;
  isLoading: boolean;
};

export function AccountsTable({
  accounts,
  allAccounts,
  storesList,
  accountTrendData,
  exchangeRates,
  hoveredAccountId,
  setHoveredAccountId,
  onViewFlow,
  onEdit,
  onDelete,
  onViewDetail,
  isLoading,
}: AccountsTableProps) {
  const router = useRouter();

  // 按币种自定义显示/隐藏账户卡片（数据库持久化 + localStorage fallback）
  const [hiddenCurrencies, setHiddenCurrencies] = useState<Set<string>>(new Set());
  const [showCurrencyConfig, setShowCurrencyConfig] = useState(false);
  const [accountOrder, setAccountOrder] = useState<string[]>([]);
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null);
  const [accountGroups, setAccountGroups] = useState<AccountGroupState>({ groups: DEFAULT_ACCOUNT_GROUPS, assignments: {} });
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [showGroupEditor, setShowGroupEditor] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_GROUP_ID);
  const [accountLayoutHydrated, setAccountLayoutHydrated] = useState(false);
  const [canEditLayout, setCanEditLayout] = useState(false);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutLoadVersion, setLayoutLoadVersion] = useState(0);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<AccountGroup | null>(null);
  const layoutMutationLock = useRef(false);
  const canChangeLayout = accountLayoutHydrated && canEditLayout && !layoutSaving;

  useEffect(() => {
    let cancelled = false;
    loadHiddenCurrencies().then(s => { if (!cancelled) setHiddenCurrencies(s); });
    setAccountLayoutHydrated(false);
    setCanEditLayout(false);
    setLayoutError(null);
    const localGroups = loadAccountGroups();
    const localOrder = loadAccountOrder();
    setAccountOrder(localOrder);
    setAccountGroups(localGroups);
    setSelectedGroupId(loadSelectedGroup());
    loadAccountLayoutFromServer().then(async (remote) => {
      if (cancelled) return;
      if (!remote) {
        setLayoutError("分组配置加载失败，暂时无法修改；请重试。");
        setAccountLayoutHydrated(true);
        return;
      }
      let next = { ...remote.state, accountOrder: remote.accountOrder };
      const localHasCustomData = localOrder.length > 0 || Object.keys(localGroups.assignments).length > 0 || JSON.stringify(localGroups.groups) !== JSON.stringify(DEFAULT_ACCOUNT_GROUPS);
      // Migrate a browser-only layout in one write, only when no server record exists.
      if (!remote.exists && localHasCustomData && remote.canEdit) {
        try {
          next = await saveAccountLayoutToServer({ ...localGroups, accountOrder: localOrder });
        } catch {
          if (!cancelled) {
            setLayoutError("旧分组配置上传失败，请重试后再修改。");
            setAccountLayoutHydrated(true);
          }
          return;
        }
      }
      if (cancelled) return;
      setAccountGroups(next);
      setAccountOrder(next.accountOrder);
      saveAccountGroups(next);
      saveAccountOrder(next.accountOrder);
      setCanEditLayout(remote.canEdit);
      setAccountLayoutHydrated(true);
    });
    return () => { cancelled = true; };
  }, [layoutLoadVersion]);

  // 删除分组或清理旧数据后，自动回到“全部账户”，避免停留在不存在的分组。
  useEffect(() => {
    if (accountLayoutHydrated && selectedGroupId !== ALL_GROUP_ID && selectedGroupId !== UNGROUPED_ACCOUNT_GROUP_ID && !accountGroups.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(ALL_GROUP_ID);
      saveSelectedGroup(ALL_GROUP_ID);
    }
  }, [accountGroups.groups, selectedGroupId, accountLayoutHydrated]);

  // Filtering the visible cards must never erase hidden accounts' saved order.
  const completeAccountOrder = useMemo(() => Array.from(new Set([
    ...accountOrder,
    ...accounts.map((account) => account.id),
    ...allAccounts.map((account) => account.id),
  ])), [accountOrder, accounts, allAccounts]);

  const persistLayout = async (next: AccountLayoutState): Promise<boolean> => {
    if (!canChangeLayout || layoutMutationLock.current) return false;
    layoutMutationLock.current = true;
    setLayoutSaving(true);
    setLayoutError(null);
    try {
      const saved = await saveAccountLayoutToServer(next);
      setAccountGroups(saved);
      setAccountOrder(saved.accountOrder);
      saveAccountGroups(saved);
      saveAccountOrder(saved.accountOrder);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存分组和排序失败，请重试";
      setLayoutError(message);
      toast.error(message);
      return false;
    } finally {
      layoutMutationLock.current = false;
      setLayoutSaving(false);
    }
  };

  // 当前列表中出现的所有币种
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(a => set.add(a.currency === "RMB" ? "CNY" : a.currency));
    return Array.from(set).sort();
  }, [accounts]);

  const toggleCurrency = (curr: string) => {
    setHiddenCurrencies(prev => {
      const next = new Set(prev);
      if (next.has(curr)) next.delete(curr);
      else next.add(curr);
      return next;
    });
  };

  const saveCurrencies = () => {
    saveHiddenCurrencies(hiddenCurrencies);
    setShowCurrencyConfig(false);
  };

  // 过滤掉隐藏币种的账户
  const filteredAccounts = accounts.filter(acc => {
    const curr = acc.currency === "RMB" ? "CNY" : acc.currency;
    return !hiddenCurrencies.has(curr);
  });
  const orderedAccounts = [...filteredAccounts].sort((a, b) => {
    const aIndex = completeAccountOrder.indexOf(a.id);
    const bIndex = completeAccountOrder.indexOf(b.id);
    return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
  });

  const groupedAccounts = [
    ...accountGroups.groups,
    { id: UNGROUPED_ACCOUNT_GROUP_ID, name: "未分组" },
  ].map((group) => ({
      ...group,
      accounts: orderedAccounts.filter((account) => getAccountGroupId(account, accountGroups) === group.id),
  }));

  const selectedGroup = groupedAccounts.find((group) => group.id === selectedGroupId);
  const visibleAccounts = selectedGroupId === ALL_GROUP_ID ? orderedAccounts : selectedGroup?.accounts || [];

  const selectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    saveSelectedGroup(groupId);
    setDragOverGroupId(null);
  };

  const assignAccountToGroup = async (accountId: string, groupId: string) => {
    const account = allAccounts.find((item) => item.id === accountId);
    if (!account || getAccountGroupId(account, accountGroups) === groupId) return;
    if (groupId !== UNGROUPED_ACCOUNT_GROUP_ID && !accountGroups.groups.some((group) => group.id === groupId)) return;
    await persistLayout({
      ...accountGroups,
      assignments: { ...accountGroups.assignments, [accountId]: groupId },
      accountOrder: completeAccountOrder,
    });
  };

  const addAccountGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    const id = `custom-${Date.now()}`;
    if (await persistLayout({ ...accountGroups, groups: [...accountGroups.groups, { id, name }], accountOrder: completeAccountOrder })) setNewGroupName("");
  };

  const startEditingGroup = (group: AccountGroup) => {
    if (!canChangeLayout) return;
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const saveEditedGroup = async () => {
    if (!editingGroupId) return;
    const name = editingGroupName.trim();
    if (!name) return;
    if (await persistLayout({
      ...accountGroups,
      groups: accountGroups.groups.map((group) => group.id === editingGroupId ? { ...group, name } : group),
      accountOrder: completeAccountOrder,
    })) {
      setEditingGroupId(null);
      setEditingGroupName("");
    }
  };

  const removeAccountGroup = async () => {
    if (!pendingDeleteGroup) return;
    const groupId = pendingDeleteGroup.id;
    const next = deleteAccountGroup({ ...accountGroups, accountOrder: completeAccountOrder }, groupId, allAccounts);
    if (await persistLayout(next)) {
      if (selectedGroupId === groupId) selectGroup(ALL_GROUP_ID);
      if (editingGroupId === groupId) setEditingGroupId(null);
      setPendingDeleteGroup(null);
      toast.success("分组已删除，账户保留在未分组中");
    }
  };

  const resetDrag = () => {
    setDraggedAccountId(null);
    setDraggedGroupId(null);
    setDragOverGroupId(null);
    setDragOverAccountId(null);
  };

  const reorderGroup = async (sourceId: string, targetId: string) => {
    const current = { ...accountGroups, accountOrder: completeAccountOrder };
    const next = moveAccountGroup(current, sourceId, targetId);
    if (next !== current) await persistLayout(next);
  };

  const startGroupDrag = (event: DragEvent, groupId: string) => {
    if (!canChangeLayout || !accountGroups.groups.some((group) => group.id === groupId)) {
      event.preventDefault();
      return;
    }
    resetDrag();
    setDraggedGroupId(groupId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(GROUP_DRAG_TYPE, groupId);
  };

  const isAccountDrag = (event: DragEvent) => Boolean(draggedAccountId && event.dataTransfer.types.includes(ACCOUNT_DRAG_TYPE));
  const isGroupDrag = (event: DragEvent) => Boolean(draggedGroupId && event.dataTransfer.types.includes(GROUP_DRAG_TYPE));

  const handleGroupDragOver = (event: DragEvent, groupId: string) => {
    const realGroup = accountGroups.groups.some((group) => group.id === groupId);
    if (!canChangeLayout || (!isAccountDrag(event) && !(isGroupDrag(event) && realGroup))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverGroupId(groupId);
    setDragOverAccountId(null);
  };

  const handleGroupDrop = (event: DragEvent, groupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (canChangeLayout && isGroupDrag(event)) {
      const sourceId = event.dataTransfer.getData(GROUP_DRAG_TYPE);
      if (sourceId === draggedGroupId) void reorderGroup(sourceId, groupId);
    } else if (canChangeLayout && isAccountDrag(event)) {
      const sourceId = event.dataTransfer.getData(ACCOUNT_DRAG_TYPE);
      if (sourceId === draggedAccountId) {
        if (groupId === ALL_GROUP_ID) selectGroup(ALL_GROUP_ID);
        else void assignAccountToGroup(sourceId, groupId);
      }
    }
    resetDrag();
  };

  const moveAccount = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const target = allAccounts.find((account) => account.id === targetId);
    if (!target || !allAccounts.some((account) => account.id === sourceId)) return;
    const nextOrder = [...completeAccountOrder];
    const from = nextOrder.indexOf(sourceId);
    const to = nextOrder.indexOf(targetId);
    if (from < 0 || to < 0) return;
    nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, sourceId);
    // Card ordering and its group change must be saved atomically, not as two racing requests.
    await persistLayout({
      ...accountGroups,
      assignments: { ...accountGroups.assignments, [sourceId]: getAccountGroupId(target, accountGroups) },
      accountOrder: nextOrder,
    });
  };

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="py-8 text-center text-slate-500">加载中...</div>
      </section>
    );
  }

  if (accounts.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="py-8 text-center text-slate-500">暂无账户，请点击右上角"新增账户"</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      {/* 标题 + 自定义按钮 */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium text-slate-300">
          账户卡片
          <span className="ml-2 text-xs font-normal text-slate-500">分类标签和账户卡片均可拖动排序</span>
          {hiddenCurrencies.size > 0 && (
            <span className="ml-2 text-xs text-slate-500">（已隐藏 {hiddenCurrencies.size} 个币种）</span>
          )}
        </div>
        <div className="flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setShowCurrencyConfig(!showCurrencyConfig)}
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-500 transition"
            title="按币种自定义显示"
          >
            <Settings className="h-3.5 w-3.5" />
            自定义币种
          </button>
          {showCurrencyConfig && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl z-30">
              <div className="mb-2 text-xs font-medium text-slate-300">选择要显示的币种</div>
              <div className="space-y-1.5 mb-3">
                {availableCurrencies.map(curr => (
                  <label key={curr} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-slate-100">
                    <input
                      type="checkbox"
                      checked={!hiddenCurrencies.has(curr)}
                      onChange={() => toggleCurrency(curr)}
                      className="rounded border-slate-600 bg-slate-800"
                    />
                    {curr}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { loadHiddenCurrencies().then(s => setHiddenCurrencies(s)); setShowCurrencyConfig(false); }}
                  className="flex-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  onClick={saveCurrencies}
                  className="flex-1 rounded-lg bg-primary-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-primary-500"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowGroupEditor((value) => !value)} className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400 transition hover:border-slate-500 hover:text-slate-200" title="管理账户分组">
            <FolderKanban className="h-3.5 w-3.5" />
            管理分组
          </button>
          {showGroupEditor && (
            <div className="absolute right-0 top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
              <div className="mb-2 text-xs font-medium text-slate-300">自定义账户分组</div>
              <div className="mb-2 text-[11px] text-slate-500">拖动手柄或使用箭头排序；删除分组不会删除账户。</div>
              <div className="mb-3 max-h-72 space-y-1 overflow-y-auto">
                {accountGroups.groups.map((group, index) => (
                  <div
                    key={group.id}
                    onDragOver={(event) => { if (isGroupDrag(event)) handleGroupDragOver(event, group.id); }}
                    onDrop={(event) => handleGroupDrop(event, group.id)}
                    className={`rounded-md bg-slate-800/60 px-2 py-1.5 text-xs text-slate-300 ${dragOverGroupId === group.id ? "ring-1 ring-cyan-400" : ""} ${draggedGroupId === group.id ? "opacity-50" : ""}`}
                  >
                    {editingGroupId === group.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          disabled={!canChangeLayout}
                          value={editingGroupName}
                          onChange={(event) => setEditingGroupName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveEditedGroup();
                            if (event.key === "Escape" && !layoutSaving) { setEditingGroupId(null); setEditingGroupName(""); }
                          }}
                          className="min-w-0 flex-1 rounded border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-cyan-400"
                          aria-label="分组名称"
                        />
                        <button type="button" disabled={!canChangeLayout || !editingGroupName.trim()} onClick={saveEditedGroup} className="rounded p-1 text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-40" title="保存分组名称" aria-label="保存分组名称"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={layoutSaving} onClick={() => { setEditingGroupId(null); setEditingGroupName(""); }} className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-slate-200 disabled:opacity-40" title="取消修改" aria-label="取消修改"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span draggable={canChangeLayout} onDragStart={(event) => startGroupDrag(event, group.id)} onDragEnd={resetDrag} className={canChangeLayout ? "cursor-grab rounded p-1 active:cursor-grabbing" : "rounded p-1 opacity-40"} title="拖动分组排序"><GripVertical className="h-3.5 w-3.5" /></span>
                        <span className="min-w-0 flex-1 truncate">{group.name}</span>
                        <button type="button" disabled={!canChangeLayout || index === 0} onClick={() => void reorderGroup(group.id, accountGroups.groups[index - 1].id)} className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-cyan-200 disabled:opacity-30" title="上移分组" aria-label={`上移${group.name}`}><ArrowUp className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={!canChangeLayout || index === accountGroups.groups.length - 1} onClick={() => void reorderGroup(group.id, accountGroups.groups[index + 1].id)} className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-cyan-200 disabled:opacity-30" title="下移分组" aria-label={`下移${group.name}`}><ArrowDown className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={!canChangeLayout} onClick={() => startEditingGroup(group)} className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-cyan-200 disabled:opacity-30" title="修改分组名称" aria-label={`修改${group.name}名称`}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" disabled={!canChangeLayout} onClick={() => setPendingDeleteGroup(group)} className="rounded p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30" title="删除分组（不删除账户）" aria-label={`删除${group.name}分组`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
                {accountGroups.groups.length === 0 && <div className="py-2 text-center text-xs text-slate-500">暂无分组，账户保留在“未分组”中</div>}
              </div>
              <div className="flex gap-2">
                <input disabled={!canChangeLayout} value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addAccountGroup(); }} placeholder="输入分组名称" aria-label="新分组名称" className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-primary-400 disabled:opacity-40" />
                <button type="button" disabled={!canChangeLayout || !newGroupName.trim()} onClick={addAccountGroup} className="rounded-md bg-primary-600 px-2 text-white hover:bg-primary-500 disabled:opacity-40" title="新增分组" aria-label="新增分组"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      <div aria-live="polite" className="mb-2 text-xs text-slate-500">
        {!accountLayoutHydrated ? "正在加载分组配置…" : layoutSaving ? "正在保存分组和排序…" : !canEditLayout && !layoutError ? "当前账号仅可查看分组，修改需管理员或经理权限。" : null}
      </div>
      {layoutError && <div role="alert" className="mb-3 flex items-center gap-2 text-xs text-amber-300">
        <span>{layoutError}</span>
        {!canEditLayout && <button type="button" onClick={() => setLayoutLoadVersion((value) => value + 1)} className="underline">重新加载</button>}
      </div>}
      <div className="mb-5 rounded-xl border border-slate-800/90 bg-slate-950/35 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectGroup(ALL_GROUP_ID)}
            onDragOver={(event) => handleGroupDragOver(event, ALL_GROUP_ID)}
            onDrop={(event) => handleGroupDrop(event, ALL_GROUP_ID)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${selectedGroupId === ALL_GROUP_ID ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200" : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/70 hover:text-slate-200"} ${dragOverGroupId === ALL_GROUP_ID ? "ring-2 ring-cyan-400/70" : ""}`}
          >
            <span>全部账户</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedGroupId === ALL_GROUP_ID ? "bg-cyan-300/20 text-cyan-100" : "bg-slate-800 text-slate-500"}`}>{orderedAccounts.length}</span>
          </button>
          {groupedAccounts.map((group) => (
            <button
              key={group.id}
              type="button"
              draggable={canChangeLayout && group.id !== UNGROUPED_ACCOUNT_GROUP_ID}
              onDragStart={(event) => startGroupDrag(event, group.id)}
              onDragEnd={resetDrag}
              title={group.id === UNGROUPED_ACCOUNT_GROUP_ID ? "尚未归类的账户（固定分类）" : "拖动调整分类顺序，也可在管理分组中使用上下箭头"}
              onClick={() => selectGroup(group.id)}
              onDragOver={(event) => handleGroupDragOver(event, group.id)}
              onDrop={(event) => handleGroupDrop(event, group.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${selectedGroupId === group.id ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-200" : "border-transparent text-slate-400 hover:border-slate-700 hover:bg-slate-800/70 hover:text-slate-200"} ${dragOverGroupId === group.id ? "ring-2 ring-cyan-400/70" : ""} ${draggedGroupId === group.id ? "opacity-50" : ""} ${canChangeLayout && group.id !== UNGROUPED_ACCOUNT_GROUP_ID ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              {group.id === UNGROUPED_ACCOUNT_GROUP_ID ? <FolderKanban className="h-3.5 w-3.5" /> : <GripVertical className="h-3.5 w-3.5" />}
              <span>{group.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${selectedGroupId === group.id ? "bg-cyan-300/20 text-cyan-100" : "bg-slate-800 text-slate-500"}`}>{group.accounts.length}</span>
            </button>
          ))}
          {draggedAccountId && <span className="ml-1 text-[11px] text-cyan-300">拖到分组即可归类</span>}
          {draggedGroupId && <span className="ml-1 text-[11px] text-cyan-300">拖到其他分类标签调整顺序</span>}
        </div>
      </div>
      <div className="space-y-5">
        {visibleAccounts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            {selectedGroupId === ALL_GROUP_ID ? "没有可显示的账户卡片（所有币种已被隐藏）" : "这个分组暂时没有账户"}
          </div>
        ) : (
          <div
            className="grid gap-6"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "24px" }}
          >
            {visibleAccounts.map((acc) => {
          const IconComponent = getAccountIcon(acc);
          const trendData = accountTrendData[acc.id] || [];
          const displayBalance = acc.originalBalance || 0;
          const purposeLabel = acc.accountPurpose;
          const isPagoWallet = /pago/i.test(`${acc.name} ${purposeLabel || ""}`);
          const associatedStore = acc.storeId ? storesList.find((s) => s.id === acc.storeId) : null;
          const accountCountry = COUNTRIES.find((c: CountryLike) => c.code === (acc.country || "CN"));
          const isHovered = hoveredAccountId === acc.id;
          const childCount =
            acc.accountCategory === "PRIMARY" ? allAccounts.filter((a) => a.parentId === acc.id).length : 0;
          const parentAccount = acc.parentId ? allAccounts.find((a) => a.id === acc.parentId) : null;
          const isParentAccount = acc.accountCategory === "PRIMARY" || childCount > 0;

          const formatCreatedAt = (dateStr?: string) => {
            if (!dateStr) return "-";
            try {
              return new Date(dateStr).toLocaleString("zh-CN", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
            } catch {
              return dateStr;
            }
          };

          const getCurrencyBadgeStyle = () => {
            switch (acc.currency) {
              case "RMB":
                return "bg-red-500/20 text-red-200 border-red-400/30";
              case "USD":
                return "bg-blue-500/20 text-blue-200 border-blue-400/30";
              case "JPY":
                return "bg-purple-500/20 text-purple-200 border-purple-400/30";
              case "EUR":
                return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
              case "BRL":
                return "bg-green-600/20 text-green-200 border-green-400/30";
              default:
                return "bg-slate-500/20 text-slate-200 border-slate-400/30";
            }
          };

          const currencyBadgeStyle = getCurrencyBadgeStyle();
          const currencyLabel = acc.currency === "RMB" ? "CNY" : acc.currency;

          return (
            <div
              key={acc.id}
              draggable={canChangeLayout}
              onDragStart={(event) => {
                if (!canChangeLayout) { event.preventDefault(); return; }
                resetDrag();
                setDraggedAccountId(acc.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(ACCOUNT_DRAG_TYPE, acc.id);
              }}
              onDragOver={(event) => {
                if (!canChangeLayout || !isAccountDrag(event)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (draggedAccountId !== acc.id) setDragOverAccountId(acc.id);
                setDragOverGroupId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (canChangeLayout && isAccountDrag(event)) {
                  const sourceId = event.dataTransfer.getData(ACCOUNT_DRAG_TYPE);
                  if (sourceId === draggedAccountId) void moveAccount(sourceId, acc.id);
                }
                resetDrag();
              }}
              onDragEnd={resetDrag}
              className={`group relative overflow-hidden rounded-2xl border p-5 transition-all ${dragOverAccountId === acc.id ? "ring-2 ring-cyan-400/80" : ""} ${draggedAccountId === acc.id ? "opacity-50" : ""}`}
              style={{
                background: isParentAccount
                  ? "linear-gradient(135deg, #233b72 0%, #101a31 100%)"
                  : "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
                borderRadius: "16px",
                border: isParentAccount
                  ? "1px solid rgba(148, 163, 184, 0.18)"
                  : "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="mt-1 cursor-grab rounded-md bg-white/10 p-1.5 text-white/60 active:cursor-grabbing" title="拖动排序" aria-label="拖动排序">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className={`flex items-center gap-2 rounded-full border px-4 py-1.5 backdrop-blur-sm ${currencyBadgeStyle}`}>
                  <Globe className="h-4 w-4" />
                  <span className="text-sm font-bold">{currencyLabel}</span>
                </div>
                <div
                  className="relative z-30 flex gap-1"
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    setHoveredAccountId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/finance/accounts/balance-detail?accountId=${acc.id}&name=${encodeURIComponent(acc.name)}`);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="查看余额计算详情"
                  >
                    <Calculator className="h-4 w-4" />
                  </button>
                  {onViewDetail && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetail(acc);
                      }}
                      className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                      title="详情"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewFlow(acc);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="查看流水"
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(acc);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="编辑"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(acc.id);
                    }}
                    className="rounded-lg bg-white/10 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/20"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center gap-3">
                  {isPagoWallet ? (
                    <div
                      className="flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg border border-sky-300/25 bg-sky-400/10 px-2 text-sky-100 backdrop-blur-sm"
                      title="Mercado Pago 钱包"
                      aria-label="Mercado Pago 钱包"
                    >
                      <WalletCards className="h-5 w-5" />
                      <span className="text-[10px] font-semibold">PAGO</span>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 break-words text-lg font-semibold leading-6 text-white">{acc.name}</div>
                    <div className="font-mono text-xs text-white/70">{formatAccountNumber(acc.accountNumber)}</div>
                    {acc.owner && (
                      <div className="mt-1 text-xs text-white/60">
                        <span className="text-white/50">归属人：</span>
                        <span className="font-medium text-amber-300">{acc.owner}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {acc.accountType && (
                    <span
                      className={`inline-block rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm ${
                        acc.accountType === "对公"
                          ? "border-blue-400/30 bg-blue-500/30 text-blue-200"
                          : acc.accountType === "对私"
                            ? "border-purple-400/30 bg-purple-500/30 text-purple-200"
                            : "border-amber-400/30 bg-amber-500/30 text-amber-200"
                      }`}
                    >
                      {acc.accountType}
                    </span>
                  )}
                  {purposeLabel && (
                    <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur-sm">
                      {purposeLabel}
                    </span>
                  )}
                </div>
                {childCount > 0 && (
                  <div className="mt-2 text-xs text-white/70">
                    <span className="text-white/50">子账户：</span>
                    <span className="ml-1 font-medium text-primary-300">{childCount} 个</span>
                  </div>
                )}
                {parentAccount && (
                  <div className="mt-2 text-xs text-white/70">
                    <span className="text-white/50">父账户：</span>
                        <span className="ml-1 break-words font-medium text-blue-300">{parentAccount.name}</span>
                  </div>
                )}
              </div>

              <div className="mb-4">
                <div className="mb-1 font-medium text-white/70 text-xs">账户余额</div>
                <div className="text-3xl font-bold text-white drop-shadow-lg" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {acc.currency === "RMB"
                    ? currency(displayBalance, "CNY")
                    : acc.currency === "USD"
                      ? currency(displayBalance, "USD")
                      : acc.currency === "JPY"
                        ? `¥${formatNumber(displayBalance)}`
                        : acc.currency === "BRL"
                          ? currency(displayBalance, "BRL")
                          : `${formatNumber(displayBalance)} ${acc.currency}`}
                </div>
                {acc.currency !== "RMB" && (
                  <div className="mt-1 text-xs text-white/60">
                    约{" "}
                    {currency(
                      (() => {
                        let rate = acc.exchangeRate || 1;
                        if (exchangeRates) {
                          if (acc.currency === "USD") rate = exchangeRates.USD;
                          else if (acc.currency === "JPY") rate = exchangeRates.JPY;
                          else if (acc.currency === "BRL") rate = exchangeRates.BRL || rate;
                        }
                        return displayBalance * rate;
                      })(),
                      "CNY"
                    )}
                    {exchangeRates && <span className="ml-1 text-[10px] text-cyan-400/70">(实时)</span>}
                  </div>
                )}
              </div>

              <div className="h-20">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id={`gradient-${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="balance" stroke="#60a5fa" strokeWidth={2} fill={`url(#gradient-${acc.id})`} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-500">暂无数据</div>
                )}
              </div>

              
            </div>
          );
            })}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeleteGroup)}
        title="删除账户分组"
        message={`确定删除“${pendingDeleteGroup?.name || ""}”分组吗？\n该分组内 ${allAccounts.filter((account) => getAccountGroupId(account, accountGroups) === pendingDeleteGroup?.id).length} 个账户将移到“未分组”。\n仅删除分类，不删除账户，不改变余额、父子账户关系或财务流水。`}
        confirmText="删除分组"
        type="danger"
        onConfirm={removeAccountGroup}
        onCancel={() => { if (!layoutMutationLock.current) setPendingDeleteGroup(null); }}
      />
    </section>
  );
}
