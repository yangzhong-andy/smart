"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import useSWR, { mutate } from "swr";
import { toast } from "sonner";
import { Shield, X } from "lucide-react";
import { SIDEBAR_NAV_STRUCTURE, SIDEBAR_TOP_LEVEL_LABELS } from "@/lib/sidebar-nav";
import {
  emptyConfig,
  parseDepartmentAccessRuleConfig,
  normalizeRuleConfigForSave,
  type DepartmentAccessRuleConfig,
} from "@/lib/department-access-config";
import { useRouter } from "next/navigation";
import { InteractiveButton } from "@/components/ui/InteractiveButton";

type Department = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type RuleRow = {
  id: string;
  departmentId: string;
  config: DepartmentAccessRuleConfig | null;
  department?: { id: string; name: string; code: string | null; isActive: boolean };
};

export default function DepartmentPermissionsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [modalDept, setModalDept] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentAccessRuleConfig>(emptyConfig());
  const [saving, setSaving] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  // 权限检查
  useEffect(() => {
    if (status === "loading") return;
    const role = session?.user?.role;
    if (role !== "SUPER_ADMIN" && role !== "ADMIN") {
      toast.error("权限不足");
      router.replace("/");
    }
  }, [session, status, router]);

  // 加载部门列表
  const { data: deptsData } = useSWR<Department[]>(
    "/api/departments?page=1&pageSize=500",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) return [];
      const d = await res.json();
      if (Array.isArray(d)) return d;
      if (d?.data && Array.isArray(d.data)) return d.data;
      if (d?.error) return [];
      return [];
    }
  );

  // 加载规则列表
  const { data: rulesData, mutate: mutateRules } = useSWR<RuleRow[]>(
    "/api/department-access-rules",
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) return [];
      const d = await res.json();
      if (Array.isArray(d)) return d;
      if (d?.data && Array.isArray(d.data)) return d.data;
      if (d?.error) return [];
      return [];
    }
  );

  const depts: Department[] = deptsData ?? [];
  const rules: RuleRow[] = rulesData ?? [];

  // 规则按 departmentId 映射
  const ruleMap = useMemo(() => {
    const m: Record<string, RuleRow> = {};
    rules.forEach((r) => { m[r.departmentId] = r; });
    return m;
  }, [rules]);

  const openModal = (dept: Department) => {
    const existing = ruleMap[dept.id];
    const config = existing?.config ?? emptyConfig();
    setForm(config);
    setExpandedMenus(new Set());
    setModalDept(dept);
  };

  const closeModal = () => {
    setModalDept(null);
    setForm(emptyConfig());
  };

  const toggleMenu = (label: string) => {
    setForm((f) => {
      const list = f.menuLabels || [];
      return {
        ...f,
        menuLabels: list.includes(label) ? list.filter(l => l !== label) : [...list, label],
      };
    });
  };

  const toggleChild = (parentLabel: string, href: string) => {
    setForm((f) => {
      // 如果当前是"全部可见"模式（没有 childHrefs 配置），
      // 先初始化为全部选中，再切换目标项
      let current = f.childHrefs?.[parentLabel];
      if (!current || current.length === 0) {
        // 找到该父级下所有子菜单 href，全部选中
        const group = SIDEBAR_NAV_STRUCTURE.find(g => g.label === parentLabel);
        current = group ? group.children.map(ch => ch.href) : [];
      }
      const updated = current.includes(href)
        ? current.filter(h => h !== href)
        : [...current, href];
      return { ...f, childHrefs: { ...f.childHrefs, [parentLabel]: updated } };
    });
  };

  const toggleExpand = (label: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleSave = async () => {
    if (!modalDept) return;
    setSaving(true);
    try {
      const normalized = normalizeRuleConfigForSave(form);
      const res = await fetch("/api/department-access-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: modalDept.id, config: normalized }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "保存失败");
      toast.success("部门权限已保存");
      await mutateRules();
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

  const handleDelete = async (deptId: string) => {
    if (!confirm("确定要恢复默认（全部可见）吗？")) return;
    try {
      await fetch(`/api/department-access-rules?departmentId=${deptId}`, { method: "DELETE" });
      toast.success("已恢复默认权限");
      await mutateRules();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("department-access-updated"));
      }
    } catch {
      toast.error("操作失败");
    }
  };

  if (status === "loading") {
    return <div className="p-8 text-slate-400">加载中...</div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 min-h-screen">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary-400" />
          部门权限管理
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          为每个部门配置可见的菜单。不配置的部门默认看到所有菜单。
        </p>
      </div>

      {/* 部门列表 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-300">部门名称</th>
              <th className="px-4 py-3 text-left font-medium text-slate-300">部门代码</th>
              <th className="px-4 py-3 text-left font-medium text-slate-300">权限状态</th>
              <th className="px-4 py-3 text-left font-medium text-slate-300">菜单数</th>
              <th className="px-4 py-3 text-center font-medium text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {depts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">暂无部门数据</td></tr>
            )}
            {depts.map((dept) => {
              const rule = ruleMap[dept.id];
              const config = rule?.config;
              const hasCustom = config && config.menuLabels && config.menuLabels.length > 0;
              return (
                <tr key={dept.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 text-slate-100 font-medium">{dept.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{dept.code || "-"}</td>
                  <td className="px-4 py-3">
                    {hasCustom ? (
                      <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">自定义</span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs bg-slate-500/20 text-slate-400">默认（全部可见）</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">
                    {hasCustom ? `${config!.menuLabels!.length} 个一级菜单` : "-"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => openModal(dept)}
                        className="px-3 py-1 rounded border border-primary-500/40 bg-primary-500/10 text-xs text-primary-100 hover:bg-primary-500/20"
                      >
                        {hasCustom ? "编辑" : "配置"}
                      </button>
                      {hasCustom && (
                        <button
                          onClick={() => handleDelete(dept.id)}
                          className="px-3 py-1 rounded border border-rose-500/40 bg-rose-500/10 text-xs text-rose-100 hover:bg-rose-500/20"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 配置弹窗 */}
      {modalDept && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-slate-900 rounded-xl border border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-slate-100">
                配置权限 - {modalDept.name}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-400 mb-2">
                勾选该部门能看到的一级菜单。展开可配置二级菜单（不展开则该菜单下全部子菜单可见）。
              </div>

              {SIDEBAR_NAV_STRUCTURE.map((group) => {
                const isChecked = (form.menuLabels || []).includes(group.label);
                const isExpanded = expandedMenus.has(group.label);
                const childHrefs = form.childHrefs?.[group.label];
                const hasChildConfig = childHrefs && childHrefs.length > 0;

                return (
                  <div key={group.label} className="rounded-lg border border-slate-700/50 overflow-hidden">
                    {/* 一级菜单 */}
                    <div className="flex items-center gap-2 p-3 bg-slate-800/40">
                      <label className="flex items-center gap-2 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMenu(group.label)}
                          className="h-4 w-4 rounded"
                        />
                        <span className="text-sm font-medium text-slate-200">{group.label}</span>
                      </label>

                    </div>

                    {/* 二级菜单 - 勾选一级菜单后自动展开 */}
                    {isChecked && (
                      <div className="p-3 bg-slate-900/60">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={!hasChildConfig}
                            onChange={() => {
                              setForm((f) => {
                                const newChild = { ...f.childHrefs };
                                if (hasChildConfig) {
                                  delete newChild[group.label];
                                } else {
                                  newChild[group.label] = [];
                                }
                                return { ...f, childHrefs: newChild };
                              });
                            }}
                            className="h-3 w-3 rounded"
                          />
                          <span className="text-xs text-slate-400">
                            {hasChildConfig ? "取消勾选则恢复全部可见" : "全部子菜单可见（取消后可逐个选择）"}
                          </span>
                        </div>
                        {/* 始终显示子菜单列表 */}
                        <div className="grid grid-cols-2 gap-1 ml-5 mt-2">
                          {group.children.map((child) => {
                            const childChecked = !hasChildConfig || childHrefs.includes(child.href);
                            return (
                              <label key={child.href} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={childChecked}
                                  onChange={() => toggleChild(group.label, child.href)}
                                  className="h-3 w-3 rounded"
                                />
                                {child.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 默认落地页 */}
            <div className="border-t border-slate-700/50 pt-4 mt-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">登录后默认页面</label>
              <select
                value={form.defaultRoute || ""}
                onChange={(e) => setForm((f) => ({ ...f, defaultRoute: e.target.value || null }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">默认首页（/）</option>
                {(form.menuLabels || []).length > 0
                  ? SIDEBAR_NAV_STRUCTURE
                      .filter((g) => (form.menuLabels || []).includes(g.label))
                      .flatMap((g) => g.children.map((ch) => (
                        <option key={ch.href} value={ch.href}>{g.label} → {ch.label}</option>
                      )))
                  : SIDEBAR_NAV_STRUCTURE
                      .flatMap((g) => g.children.map((ch) => (
                        <option key={ch.href} value={ch.href}>{g.label} → {ch.label}</option>
                      )))
                }
              </select>
              <p className="text-xs text-slate-500 mt-1">该部门用户登录后自动跳转到此页面</p>
            </div>

            {/* 底部按钮 */}
            <div className="flex gap-3 justify-end p-5 border-t border-slate-800">
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm"
              >
                取消
              </button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-sm disabled:opacity-50">
                {saving ? "保存中..." : "保存权限"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
