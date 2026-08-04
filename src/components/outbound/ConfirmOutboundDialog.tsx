"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { ActionButton } from "@/components/ui";

export type OutboundLineItem = {
  id: string;
  variantId?: string;
  sku: string;
  skuName?: string;
  spec?: string;
  qty: number;
  shippedQty: number;
};

export type ConfirmOutboundOrder = {
  id: string;
  outboundNumber: string;
  qty: number;
  shippedQty: number;
  variantId?: string;
  items?: OutboundLineItem[];
};

type LogisticsChannel = { id: string; name: string; channelCode: string };
type StoreRow = {
  id: string;
  name: string;
  platform: string;
  country?: string;
};

type Props = {
  open: boolean;
  order: ConfirmOutboundOrder | null;
  onClose: () => void;
  onConfirm: (payload: {
    shippedQty?: number;
    itemShipments?: { itemId: string; qty: number }[];
    logisticsChannelId: string | null;
    logisticsChannelName: string | null;
    destinationCountry: string;
    destinationPlatform: string;
    storeId: string;
    storeName: string;
    ownershipType: string;
    ownershipSubjectId: string;
    ownershipSubjectName: string;
  }) => Promise<void>;
  submitting?: boolean;
};

const OWNERSHIP_TYPES = [
  { value: "STORE", label: "STORE（店铺）" },
  { value: "TEAM", label: "TEAM（团队）" },
];

export default function ConfirmOutboundDialog({
  open,
  order,
  onClose,
  onConfirm,
  submitting = false,
}: Props) {
  const [channels, setChannels] = useState<LogisticsChannel[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [logisticsChannelId, setLogisticsChannelId] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>(""); // 筛选店铺用
  const [destinationCountry, setDestinationCountry] = useState("");
  const [destinationPlatform, setDestinationPlatform] = useState("");
  const [storeId, setStoreId] = useState("");
  const [storeNameManual, setStoreNameManual] = useState("");
  const [ownershipType, setOwnershipType] = useState("STORE");
  const [ownershipSubjectId, setOwnershipSubjectId] = useState("");
  const [ownershipSubjectName, setOwnershipSubjectName] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, number>>({});
  const [singleQty, setSingleQty] = useState(0);

  const hasLines = !!(order?.items && order.items.length > 0);

  const countries = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.country && s.country.trim()) set.add(s.country.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [stores]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.platform && s.platform.trim()) set.add(s.platform.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [stores]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [chRes, stRes] = await Promise.all([
          fetch("/api/logistics-channels?page=1&pageSize=200"),
          fetch("/api/stores?page=1&pageSize=500"),
        ]);
        const chJson = await chRes.json().catch(() => ({}));
        const stJson = await stRes.json().catch(() => ({}));
        if (cancelled) return;
        setChannels(Array.isArray(chJson?.data) ? chJson.data : []);
        const rawStores = Array.isArray(stJson?.data) ? stJson.data : Array.isArray(stJson) ? stJson : [];
        setStores(rawStores);
      } catch {
        if (!cancelled) {
          setChannels([]);
          setStores([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !order) return;
    if (order.items && order.items.length > 0) {
      const init: Record<string, number> = {};
      order.items!.forEach((it) => {
        const pending = Math.max(0, it.qty - (it.shippedQty || 0));
        init[it.id] = pending;
      });
      setLineQtys(init);
    } else {
      const remaining = Math.max(0, order.qty - order.shippedQty);
      setSingleQty(remaining);
    }
    setLogisticsChannelId("");
    setCountryFilter("");
    setDestinationCountry("");
    setDestinationPlatform("");
    setStoreId("");
    setStoreNameManual("");
    setOwnershipType("STORE");
    setOwnershipSubjectId("");
    setOwnershipSubjectName("");
  }, [open, order]);

  const selectedChannel = channels.find((c) => c.id === logisticsChannelId);
  const selectedStore = stores.find((s) => s.id === storeId);

  useEffect(() => {
    if (!selectedStore) return;
    setDestinationCountry(selectedStore.country || "");
    setDestinationPlatform(selectedStore.platform || "");
    setStoreNameManual(selectedStore.name || "");
    if (ownershipType === "STORE") {
      setOwnershipSubjectId(selectedStore.id);
      setOwnershipSubjectName(selectedStore.name || "");
    }
  }, [selectedStore, ownershipType]);

  const filteredStores = useMemo(() => {
    if (!countryFilter) return stores;
    return stores.filter((s) => (s.country || "").trim() === countryFilter);
  }, [stores, countryFilter]);

  const pendingTotal = order
    ? hasLines
      ? order.items!.reduce((sum, it) => sum + Math.max(0, it.qty - (it.shippedQty || 0)), 0)
      : Math.max(0, order.qty - order.shippedQty)
    : 0;

  const shipTotalThisTime = hasLines
    ? Object.entries(lineQtys).reduce((sum, [id, q]) => {
        const it = order?.items?.find((x) => x.id === id);
        if (!it) return sum;
        const max = Math.max(0, it.qty - (it.shippedQty || 0));
        return sum + Math.min(Math.max(0, q), max);
      }, 0)
    : singleQty;

  if (!open || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!logisticsChannelId) {
      alert("请选择物流渠道");
      return;
    }
    const ch = selectedChannel;
    const finalStoreName = storeId ? (selectedStore?.name || storeNameManual) : storeNameManual;
    const finalStoreId = storeId;

    if (hasLines && order.items) {
      const itemShipments: { itemId: string; qty: number }[] = [];
      for (const it of order.items) {
        const raw = lineQtys[it.id] ?? 0;
        const max = Math.max(0, it.qty - (it.shippedQty || 0));
        const q = Math.min(Math.max(0, raw), max);
        if (q > 0) itemShipments.push({ itemId: it.id, qty: q });
      }
      if (itemShipments.length === 0) {
        alert("请至少一行填写大于 0 的出库数量");
        return;
      }
      await onConfirm({
        itemShipments,
        logisticsChannelId: logisticsChannelId || null,
        logisticsChannelName: ch?.name ?? null,
        destinationCountry: destinationCountry.trim(),
        destinationPlatform: destinationPlatform.trim(),
        storeId: finalStoreId,
        storeName: finalStoreName.trim(),
        ownershipType: ownershipType.trim(),
        ownershipSubjectId: ownershipSubjectId.trim(),
        ownershipSubjectName: ownershipSubjectName.trim(),
      });
      return;
    }

    if (!singleQty || singleQty <= 0) {
      alert("请填写有效的出库数量");
      return;
    }
    await onConfirm({
      shippedQty: Math.min(singleQty, pendingTotal),
      logisticsChannelId: logisticsChannelId || null,
      logisticsChannelName: ch?.name ?? null,
      destinationCountry: destinationCountry.trim(),
      destinationPlatform: destinationPlatform.trim(),
      storeId: finalStoreId,
      storeName: finalStoreName.trim(),
      ownershipType: ownershipType.trim(),
      ownershipSubjectId: ownershipSubjectId.trim(),
      ownershipSubjectName: ownershipSubjectName.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">确认出库</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {order.outboundNumber} · 待出库合计 {pendingTotal} 件
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <p className="text-sm text-slate-400">请选择 SKU 并填写出库数量</p>

          {hasLines && order.items ? (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              {order.items.map((it) => {
                const pending = Math.max(0, it.qty - (it.shippedQty || 0));
                const label = [it.skuName, it.spec].filter(Boolean).join(" · ") || it.sku;
                return (
                  <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-200 truncate">{label}</div>
                      <div className="text-xs text-slate-500">待出库 {pending}</div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={pending}
                      className="w-24 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-right text-slate-200"
                      value={lineQtys[it.id] ?? 0}
                      onChange={(e) =>
                        setLineQtys((prev) => ({
                          ...prev,
                          [it.id]: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-500 block mb-1">本次出库数量</label>
              <input
                type="number"
                min={1}
                max={pendingTotal}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
                value={singleQty || ""}
                onChange={(e) => setSingleQty(Number(e.target.value) || 0)}
              />
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500 block mb-1">物流渠道 *</label>
            <select
              value={logisticsChannelId}
              onChange={(e) => setLogisticsChannelId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
            >
              <option value="">请选择物流渠道</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.channelCode})
                </option>
              ))}
            </select>
            {channels.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">暂无渠道，请先在「物流中心 → 渠道管理」维护。</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">目的国家（与店铺库一致，可输入或从列表选）</label>
              <input
                list="outbound-country-suggestions"
                value={destinationCountry}
                onChange={(e) => setDestinationCountry(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
                placeholder="如 BR、巴西（与店铺管理中「国家」一致）"
              />
              <datalist id="outbound-country-suggestions">
                {countries.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">筛选店铺（按国家）</label>
              <select
                value={countryFilter}
                onChange={(e) => {
                  setCountryFilter(e.target.value);
                  setStoreId("");
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
              >
                <option value="">全部国家</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">目的平台（与店铺库一致，可输入或从列表选）</label>
            <input
              type="text"
              list="outbound-platform-suggestions"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
              placeholder="选店铺后自动带出，亦可手填"
              value={destinationPlatform}
              onChange={(e) => setDestinationPlatform(e.target.value)}
            />
            <datalist id="outbound-platform-suggestions">
              {platforms.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">关联店铺（系统内）</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
            >
              <option value="">请选择店铺</option>
              {filteredStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.platform} {s.country ? `· ${s.country}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-500 block mb-1">店铺名称（未选店铺时可手填）</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
              value={storeNameManual}
              onChange={(e) => setStoreNameManual(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">货权主体类型</label>
              <select
                value={ownershipType}
                onChange={(e) => {
                  setOwnershipType(e.target.value);
                  if (e.target.value === "STORE" && selectedStore) {
                    setOwnershipSubjectId(selectedStore.id);
                    setOwnershipSubjectName(selectedStore.name);
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
              >
                {OWNERSHIP_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">货权主体 ID</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
                value={ownershipSubjectId}
                onChange={(e) => setOwnershipSubjectId(e.target.value)}
                placeholder="选店铺后可自动带出"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">货权主体名称</label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200"
              value={ownershipSubjectName}
              onChange={(e) => setOwnershipSubjectName(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center border-t border-slate-800 pt-4 text-sm text-slate-400">
            <span>本次合计出库</span>
            <span className="text-primary-400 font-medium">{shipTotalThisTime} 件</span>
          </div>

          <div className="flex justify-end gap-2 pb-2">
            <ActionButton type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              取消
            </ActionButton>
            <ActionButton type="submit" disabled={submitting}>
              {submitting ? "提交中…" : "确认出库"}
            </ActionButton>
          </div>
        </form>
      </div>
    </div>
  );
}
