"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Pencil, Shield, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import type { DepartmentAccessRuleConfig } from "@/lib/department-access-config";
import { normalizeRuleConfigForSave, parseDepartmentAccessRuleConfig } from "@/lib/department-access-config";
import { COMMON_PATH_PREFIX_OPTIONS, SIDEBAR_TOP_LEVEL_LABELS } from "@/lib/sidebar-nav-meta";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

type DepartmentRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type RuleRow = {
  id: string;
  departmentId: string;
  config: unknown;
  updatedAt: string;
  department: DepartmentRow;
};

function emptyConfig(): DepartmentAccessRuleConfig {
  return {
    menuMode: "inherit",
    menuLabels: [],
    pathMode: "inherit",
    pathPrefixes: [],
    defaultRoute: null,
    sidebarChildHrefs: null,
  };
}

function coerceConfig(raw: unknown): DepartmentAccessRuleConfig {
  const parsed = parseDepartmentAccessRuleConfig(raw);
  return parsed ?? emptyConfig();
}

export default function DepartmentPermissionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [modalDept, setModalDept] = useState<DepartmentRow | null>(null);
  const [form, setForm] = useState<DepartmentAccessRuleConfig>(emptyConfig());
  const [pathExtraLines, setPathExtraLines] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: deptRes, mutate: mutateDepts } = useSWR(
    status === "authenticated" && session?.user?.role === "SUPER_ADMIN"
      ? "/api/departments?page=1&pageSize=500&activeOnly=false"
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  const { data: rulesRes, mutate: mutateRules } = useSWR(
    status === "authenticated" && session?.user?.role === "SUPER_ADMIN" ? "/api/department-access-rules" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  const departments: DepartmentRow[] = useMemo(() => {
    const raw = deptRes?.data;
    return Array.isArray(raw) ? raw : [];
  }, [deptRes]);

  const rules: RuleRow[] = useMemo(() => {
    const raw = rulesRes?.data;
    return Array.isArray(raw) ? raw : [];
  }, [rulesRes]);

  const ruleByDeptId = useMemo(() => {
    const m = new Map<string, RuleRow>();
    for (const r of rules) m.set(r.departmentId, r);
    return m;
  }, [rules]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
      return;
    }
    if (session.user.role !== "SUPER_ADMIN") {
      toast.error("权限不足，仅超级管理员可访问");
      router.push("/");
    }
  }, [session, status, router]);

  const openModal = useCallback(
    (dept: DepartmentRow) => {
      setModalDept(dept);
      const row = ruleByDeptId.get(dept.id);
      const cfg = row ? coerceConfig(row.config) : emptyConfig();
      setForm(cfg);
      const common = new Set(COMMON_PATH_PREFIX_OPTIONS.map((o) => o.prefix));
      const extras = (cfg.pathPrefixes || []).filter((p) => !common.has(p));
      setPathExtraLines(extras.join("\n"));
    },
    [ruleByDeptId]
  );

  const closeModal = () => {
    setModalDept(null);
    setForm(emptyConfig());
    setPathExtraLines("");
  };

  const toggleMenuLabel = (label: string) => {
    setForm((f) => {
      const cur = new Set(f.menuLabels || []);
      if (cur.has(label)) cur.delete(label);
      else cur.add(label);
      return { ...f, menuLabels: Array.from(cur) };
    });
  };

  const togglePathPrefix = (prefix: string) => {
    setForm((f) => {
      const cur = new Set(f.pathPrefixes || []);
      if (cur.has(prefix)) cur.delete(prefix);
      else cur.add(prefix);
      return { ...f, pathPrefixes: Array.from(cur) };
    });
  };

  const mergePathPrefixesForSave = (base: DepartmentAccessRuleConfig): string[] => {
    const fromForm = new Set(base.pathPrefixes || []);
    const lines = pathExtraLines
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.startsWith("/"));
    lines.forEach((l) => fromForm.add(l));
    return Array.from(fromForm);
  };

  const handleSave = async () => {
    if (!modalDept) return;
    const merged: DepartmentAccessRuleConfig = {
      ...form,
      pathPrefixes: form.pathMode === "whitelist" ? mergePathPrefixesForSave(form) : form.pathPrefixes,
    };
    const normalized = normalizeRuleConfigForSave(merged);
    if (normalized.menuMode === "whitelist" && (!normalized.menuLabels || normalized.menuLabels.length === 0)) {
      toast.error("一级菜单为白名单时，请至少勾选一项");
      return;
    }
    if (normalized.pathMode === "whitelist" && (!normalized.pathPrefixes || normalized.pathPrefixes.length === 0)) {
      toast.error("路径为白名单时，请至少选择一个前缀或填写额外路径");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/department-access-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: modalDept.id, config: normalized }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "保存失败");
      toast.success("已保存部门权限");
      await mutateRules();
      await mutateDepts();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("department-access-updated"));
      }
      closeModal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (deptId: string) => {
    if (!confirm("确定清除该部门的自定义权限？将恢复为系统内置规则（若有）。")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/department-access-rules?departmentId=${encodeURIComponent(deptId)}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof j?.error === "string" ? j.error : "删除失败");
      toast.success("已清除自定义规则");
      await mutateRules();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("department-access-updated"));
      }
      if (modalDept?.id === deptId) closeModal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || !session || session.user.role !== "SUPER_ADMIN") {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-white/10 p-3 text-white">
            <Shield className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">部门权限</h1>
            <p className="text-white/70 text-sm max-w-2xl">
              按部门配置侧栏一级菜单与 URL 路径白名单。选择「继承默认」时与原先代码内按部门 code
              的规则一致；选择「白名单」则仅使用此处配置。超级管理员不受限制。
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 backdrop-blur-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10 text-white/60">
                <th className="px-4 py-3 font-medium">部门</th>
                <th className="px-4 py-3 font-medium">编码</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">自定义规则</th>
                <th className="px-4 py-3 font-medium w-44">操作</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => {
                const row = ruleByDeptId.get(d.id);
                const cfg = row ? coerceConfig(row.config) : null;
                const summary = row
                  ? `${cfg?.menuMode === "whitelist" ? "菜单·白名单" : "菜单·继承"} / ${
                      cfg?.pathMode === "whitelist" ? "路径·白名单" : "路径·继承"
                    }`
                  : "未配置（走代码默认）";
                return (
                  <tr key={d.id} className="border-b border-white/5 text-white/90 hover:bg-white/5">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-white/60">{d.code || "—"}</td>
                    <td className="px-4 py-3">{d.isActive ? "启用" : "停用"}</td>
                    <td className="px-4 py-3 text-white/70">{summary}</td>
                    <td className="px-4 py-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openModal(d)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑
                      </button>
                      {row ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteRule(d.id)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/20"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          清除
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {departments.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/50">暂无部门数据</div>
          ) : null}
        </div>
      </div>

      {modalDept ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" role="dialog">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-lg font-semibold text-white">配置：{modalDept.name}</h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 px-5 py-4 text-sm text-slate-200">
              <div>
                <div className="font-medium text-white mb-2">一级菜单</div>
                <div className="flex gap-4 mb-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="menuMode"
                      checked={form.menuMode === "inherit"}
                      onChange={() => setForm((f) => ({ ...f, menuMode: "inherit" }))}
                    />
                    继承默认
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="menuMode"
                      checked={form.menuMode === "whitelist"}
                      onChange={() => setForm((f) => ({ ...f, menuMode: "whitelist" }))}
                    />
                    白名单
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-lg border border-white/10 p-2 bg-black/20">
                  {SIDEBAR_TOP_LEVEL_LABELS.map((label) => (
                    <label key={label} className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        disabled={form.menuMode !== "whitelist"}
                        checked={(form.menuLabels || []).includes(label)}
                        onChange={() => toggleMenuLabel(label)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-medium text-white mb-2">路径前缀（用于禁止越权访问未授权模块）</div>
                <div className="flex gap-4 mb-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pathMode"
                      checked={form.pathMode === "inherit"}
                      onChange={() => setForm((f) => ({ ...f, pathMode: "inherit" }))}
                    />
                    继承默认
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pathMode"
                      checked={form.pathMode === "whitelist"}
                      onChange={() => setForm((f) => ({ ...f, pathMode: "whitelist" }))}
                    />
                    白名单
                  </label>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-white/10 p-2 bg-black/20 space-y-1">
                  {COMMON_PATH_PREFIX_OPTIONS.map((o) => (
                    <label key={o.prefix} className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={form.pathMode !== "whitelist"}
                        checked={(form.pathPrefixes || []).includes(o.prefix)}
                        onChange={() => togglePathPrefix(o.prefix)}
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-mono text-cyan-200/90">{o.prefix}</span>
                        <span className="text-slate-400"> — {o.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-400">额外路径（每行一个，须以 / 开头）</p>
                <textarea
                  disabled={form.pathMode !== "whitelist"}
                  value={pathExtraLines}
                  onChange={(e) => setPathExtraLines(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs font-mono text-white disabled:opacity-40"
                  placeholder="/custom-module"
                />
              </div>

              <div>
                <div className="font-medium text-white mb-1">越权时的默认落地页（可选）</div>
                <input
                  type="text"
                  value={form.defaultRoute || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      defaultRoute: e.target.value.trim() || null,
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs font-mono text-white"
                  placeholder="/procurement"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                取消
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
