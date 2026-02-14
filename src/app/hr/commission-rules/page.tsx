"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import InteractiveButton from "@/components/ui/InteractiveButton";
import { Settings, Plus, Pencil, Trash2, Search, X, ToggleLeft, ToggleRight } from "lucide-react";
import { PageHeader, StatCard, ActionButton, SearchBar, EmptyState } from "@/components/ui";
import useSWR from "swr";
import {
  getCommissionRules,
  getCommissionRulesFromAPI,
  saveCommissionRules,
  upsertCommissionRule,
  deleteCommissionRule,
  type CommissionRule,
  type Department
} from "@/lib/hr-store";

// SWR fetcher
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
};

interface DepartmentFromAPI {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
}

export default function CommissionRulesPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  
  // 搜索、筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [filterDepartment, setFilterDepartment] = useState<Department | "all">("all");
  const [filterEnabled, setFilterEnabled] = useState<"all" | "enabled" | "disabled">("all");
  
  const [form, setForm] = useState({
    name: "",
    department: "" as Department | "",
    position: "",
    type: "fixed_amount" as CommissionRule["type"],
    config: {
      unitAmount: undefined as number | undefined,
      percentage: undefined as number | undefined,
      baseField: "",
      tiers: [] as Array<{ min: number; max?: number; amount: number }>,
      condition: undefined as { field: string; operator: ">" | ">=" | "<" | "<=" | "==" | "!="; value: number } | undefined,
      bonusAmount: undefined as number | undefined,
      formula: ""
    },
    dataSource: {
      module: "influencer_bd" as CommissionRule["dataSource"]["module"],
      field: "",
      filter: {}
    },
    period: "monthly" as CommissionRule["period"],
    startDate: "",
    endDate: "",
    enabled: true,
    description: ""
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = getCommissionRules();
    setRules(loaded);
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!initialized) return;
    saveCommissionRules(rules);
  }, [rules, initialized]);

  // 从 API 获取部门列表
  const { data: departmentsDataRaw } = useSWR<any>('/api/departments?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const departmentsData = (Array.isArray(departmentsDataRaw) ? departmentsDataRaw : (departmentsDataRaw?.data ?? [])) as DepartmentFromAPI[];

  // 将 API 返回的部门数据转换为页面需要的格式
  const departments = useMemo((): string[] => {
    return departmentsData.map((dept) => dept.name);
  }, [departmentsData]);

  // 统计摘要
  const stats = useMemo(() => {
    const total = rules.length;
    const enabled = rules.filter((r) => r.enabled).length;
    const disabled = rules.filter((r) => !r.enabled).length;
    // 动态计算各部门的规则数量
    const byDepartment: Record<string, number> = {};
    departments.forEach((dept) => {
      byDepartment[dept] = rules.filter((r) => r.department === dept).length;
    });
    return { total, enabled, disabled, byDepartment };
  }, [rules, departments]);

  // 筛选
  const filteredRules = useMemo(() => {
    let result = [...rules];
    
    if (filterDepartment !== "all") {
      result = result.filter((r) => r.department === filterDepartment);
    }
    
    if (filterEnabled !== "all") {
      result = result.filter((r) => filterEnabled === "enabled" ? r.enabled : !r.enabled);
    }
    
    if (searchKeyword.trim()) {
      const keyword = searchKeyword.toLowerCase();
      result = result.filter((r) =>
        r.name.toLowerCase().includes(keyword) ||
        r.description?.toLowerCase().includes(keyword)
      );
    }
    
    return result;
  }, [rules, filterDepartment, filterEnabled, searchKeyword]);

  const resetForm = () => {
    setForm({
      name: "",
      department: "" as Department | "",
      position: "",
      type: "fixed_amount",
      config: {
        unitAmount: undefined,
        percentage: undefined,
        baseField: "",
        tiers: [],
        condition: undefined,
        bonusAmount: undefined,
        formula: ""
      },
      dataSource: {
        module: "influencer_bd",
        field: "",
        filter: {}
      },
      period: "monthly",
      startDate: "",
      endDate: "",
      enabled: true,
      description: ""
    });
    setEditingRule(null);
  };

  const handleOpenModal = (rule?: CommissionRule) => {
    if (rule) {
      setEditingRule(rule);
      setForm({
        name: rule.name,
        department: rule.department,
        position: rule.position || "",
        type: rule.type,
        config: {
          unitAmount: rule.config?.unitAmount,
          percentage: rule.config?.percentage,
          baseField: rule.config?.baseField || "",
          tiers: rule.config?.tiers || [],
          condition: rule.config?.condition,
          bonusAmount: rule.config?.bonusAmount,
          formula: rule.config?.formula || ""
        },
        dataSource: {
          ...rule.dataSource,
          filter: rule.dataSource.filter || {}
        },
        period: rule.period,
        startDate: rule.startDate || "",
        endDate: rule.endDate || "",
        enabled: rule.enabled,
        description: rule.description || ""
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!form.name.trim() || !form.department) {
      toast.error("请填写规则名称和部门");
      return;
    }
    
    const ruleData: CommissionRule = {
      id: editingRule?.id || crypto.randomUUID(),
      name: form.name.trim(),
      department: form.department as Department,
      position: form.position.trim() || undefined,
      type: form.type,
      config: form.config,
      dataSource: form.dataSource,
      period: form.period,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      enabled: form.enabled,
      description: form.description.trim() || undefined,
      createdAt: editingRule?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    upsertCommissionRule(ruleData);
    setRules(getCommissionRules());
    toast.success(editingRule ? "规则已更新" : "规则已创建");
    resetForm();
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个规则吗？")) return;
    try {
      const ok = await deleteCommissionRule(id);
      if (ok) {
        const updated = await getCommissionRulesFromAPI();
        setRules(updated);
        toast.success("规则已删除");
      } else {
        toast.error("删除失败");
      }
    } catch (e) {
      console.error("删除规则失败", e);
      toast.error("删除失败，请重试");
    }
  };

  const handleToggleEnabled = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      upsertCommissionRule({ ...rule, enabled: !rule.enabled });
      setRules(getCommissionRules());
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="提成规则配置"
        description="配置各岗位的提成计算规则，支持多种计算方式"
        actions={
          <ActionButton
            onClick={() => handleOpenModal()}
            variant="primary"
            icon={Plus}
          >
            新增规则
          </ActionButton>
        }
      />

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatCard title="规则总数" value={stats.total} icon={Settings} />
        <StatCard title="已启用" value={stats.enabled} icon={Settings} />
        <StatCard title="已禁用" value={stats.disabled} icon={Settings} />
        {departments.map((dept) => (
          <StatCard key={dept} title={dept} value={stats.byDepartment[dept]} icon={Settings} />
        ))}
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/60">
        <SearchBar
          value={searchKeyword}
          onChange={setSearchKeyword}
          placeholder="搜索规则名称..."
        />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">部门：</span>
          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value as Department | "all")}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">状态：</span>
          <select
            value={filterEnabled}
            onChange={(e) => setFilterEnabled(e.target.value as typeof filterEnabled)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 outline-none focus:border-primary-400"
          >
            <option value="all">全部</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已禁用</option>
          </select>
        </div>
      </div>

      {/* 规则列表 */}
      {filteredRules.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="暂无规则"
          description="点击右上角「新增规则」开始配置"
        />
      ) : (
        <div className="space-y-3">
          {filteredRules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-primary-500/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-white text-lg">{rule.name}</h3>
                    <span className={`px-2 py-1 rounded text-xs ${
                      rule.enabled
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-700/50 text-slate-400"
                    }`}>
                      {rule.enabled ? "已启用" : "已禁用"}
                    </span>
                    <span className="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-300">
                      {rule.department}
                    </span>
                  </div>
                  <div className="text-sm text-slate-400 space-y-1">
                    <div>类型：{rule.type === "fixed_amount" ? "固定金额" : rule.type === "percentage" ? "百分比" : rule.type === "tiered" ? "阶梯提成" : rule.type === "conditional" ? "条件奖励" : "公式计算"}</div>
                    <div>数据源：{rule.dataSource.module} · {rule.dataSource.field}</div>
                    <div>周期：{rule.period === "monthly" ? "按月" : rule.period === "quarterly" ? "按季度" : rule.period === "yearly" ? "按年" : "按项目"}</div>
                    {rule.description && <div>说明：{rule.description}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleEnabled(rule.id)}
                    className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
                    title={rule.enabled ? "禁用规则" : "启用规则"}
                  >
                    {rule.enabled ? (
                      <ToggleRight className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-slate-500" />
                    )}
                  </button>
                  <ActionButton
                    onClick={() => handleOpenModal(rule)}
                    variant="secondary"
                    size="sm"
                    icon={Pencil}
                  >
                    编辑
                  </ActionButton>
                  <ActionButton
                    onClick={() => handleDelete(rule.id)}
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                  >
                    删除
                  </ActionButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑规则模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-100">
                {editingRule ? "编辑规则" : "新增规则"}
              </h2>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">规则名称 *</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">部门 *</span>
                  <select
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value as Department }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="">请选择</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">岗位（可选）</span>
                  <input
                    type="text"
                    value={form.position}
                    onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    placeholder="留空则适用整个部门"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">规则类型 *</span>
                  <select
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CommissionRule["type"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="fixed_amount">固定金额</option>
                    <option value="percentage">百分比</option>
                    <option value="tiered">阶梯提成</option>
                    <option value="conditional">条件奖励</option>
                    <option value="formula">公式计算</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">数据源模块 *</span>
                  <select
                    value={form.dataSource.module}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      dataSource: { ...f.dataSource, module: e.target.value as CommissionRule["dataSource"]["module"] }
                    }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="influencer_bd">达人BD管理</option>
                    <option value="purchase_contract">采购合同</option>
                    <option value="logistics">物流跟踪</option>
                    <option value="finance">财务审批</option>
                    <option value="store">店铺管理</option>
                    <option value="content">内容管理</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">数据字段 *</span>
                  <input
                    type="text"
                    value={form.dataSource.field}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      dataSource: { ...f.dataSource, field: e.target.value }
                    }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    placeholder="如：actualOrders, totalAmount"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">提成周期 *</span>
                  <select
                    value={form.period}
                    onChange={(e) => setForm((f) => ({ ...f, period: e.target.value as CommissionRule["period"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    required
                  >
                    <option value="monthly">按月</option>
                    <option value="quarterly">按季度</option>
                    <option value="yearly">按年</option>
                    <option value="project">按项目</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-300">状态</span>
                  <select
                    value={form.enabled ? "enabled" : "disabled"}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value === "enabled" }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  >
                    <option value="enabled">启用</option>
                    <option value="disabled">禁用</option>
                  </select>
                </label>
              </div>

              {/* 根据规则类型显示不同的配置项 */}
              {form.type === "fixed_amount" && (
                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">每单位金额（元）</span>
                  <input
                    type="number"
                    step="0.01"
                    value={form.config.unitAmount || ""}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      config: { ...f.config, unitAmount: e.target.value ? Number(e.target.value) : undefined }
                    }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    placeholder="如：10（表示每完成1个单位 = 10元）"
                  />
                </label>
              )}

              {form.type === "percentage" && (
                <>
                  <label className="block space-y-1">
                    <span className="text-sm text-slate-300">百分比（%）</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.config.percentage || ""}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        config: { ...f.config, percentage: e.target.value ? Number(e.target.value) : undefined }
                      }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                      placeholder="如：5（表示5%）"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-sm text-slate-300">基于字段</span>
                    <input
                      type="text"
                      value={form.config.baseField}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        config: { ...f.config, baseField: e.target.value }
                      }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                      placeholder="如：amount, totalAmount"
                    />
                  </label>
                </>
              )}

              {form.type === "tiered" && (
                <div className="space-y-3 p-4 rounded-lg border border-slate-700 bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-300">阶梯配置</span>
                    <ActionButton
                      type="button"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          config: {
                            ...f.config,
                            tiers: [...(f.config.tiers || []), { min: 0, max: undefined, amount: 0 }]
                          }
                        }));
                      }}
                      variant="secondary"
                      size="sm"
                    >
                      添加阶梯
                    </ActionButton>
                  </div>
                  {form.config.tiers && form.config.tiers.length > 0 && (
                    <div className="space-y-2">
                      {form.config.tiers.map((tier, index) => (
                        <div key={index} className="flex gap-2 items-end">
                          <label className="flex-1 space-y-1">
                            <span className="text-xs text-slate-400">最小数量</span>
                            <input
                              type="number"
                              value={tier.min}
                              onChange={(e) => {
                                const newTiers = [...(form.config.tiers || [])];
                                newTiers[index] = { ...tier, min: Number(e.target.value) || 0 };
                                setForm((f) => ({ ...f, config: { ...f.config, tiers: newTiers } }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
                            />
                          </label>
                          <label className="flex-1 space-y-1">
                            <span className="text-xs text-slate-400">最大数量（留空=无上限）</span>
                            <input
                              type="number"
                              value={tier.max || ""}
                              onChange={(e) => {
                                const newTiers = [...(form.config.tiers || [])];
                                newTiers[index] = { ...tier, max: e.target.value ? Number(e.target.value) : undefined };
                                setForm((f) => ({ ...f, config: { ...f.config, tiers: newTiers } }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
                              placeholder="留空"
                            />
                          </label>
                          <label className="flex-1 space-y-1">
                            <span className="text-xs text-slate-400">单价/百分比</span>
                            <input
                              type="number"
                              step="0.01"
                              value={tier.amount}
                              onChange={(e) => {
                                const newTiers = [...(form.config.tiers || [])];
                                newTiers[index] = { ...tier, amount: Number(e.target.value) || 0 };
                                setForm((f) => ({ ...f, config: { ...f.config, tiers: newTiers } }));
                              }}
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-primary-400"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const newTiers = form.config.tiers?.filter((_, i) => i !== index) || [];
                              setForm((f) => ({ ...f, config: { ...f.config, tiers: newTiers } }));
                            }}
                            className="px-2 py-1.5 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition-colors text-sm"
                          >
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {form.type === "conditional" && (
                <div className="space-y-3 p-4 rounded-lg border border-slate-700 bg-slate-800/50">
                  <label className="block space-y-1">
                    <span className="text-sm text-slate-300">条件字段</span>
                    <input
                      type="text"
                      value={form.config.condition?.field || ""}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        config: {
                          ...f.config,
                          condition: { ...(f.config.condition || { field: "", operator: ">", value: 0 }), field: e.target.value }
                        }
                      }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                      placeholder="如：orders, amount"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-sm text-slate-300">操作符</span>
                      <select
                        value={form.config.condition?.operator || ">"}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          config: {
                            ...f.config,
                            condition: { ...(f.config.condition || { field: "", operator: ">", value: 0 }), operator: e.target.value as any }
                          }
                        }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                      >
                        <option value=">">大于</option>
                        <option value=">=">大于等于</option>
                        <option value="<">小于</option>
                        <option value="<=">小于等于</option>
                        <option value="==">等于</option>
                        <option value="!=">不等于</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm text-slate-300">比较值</span>
                      <input
                        type="number"
                        value={form.config.condition?.value || ""}
                        onChange={(e) => setForm((f) => ({
                          ...f,
                          config: {
                            ...f.config,
                            condition: { ...(f.config.condition || { field: "", operator: ">", value: 0 }), value: Number(e.target.value) || 0 }
                          }
                        }))}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-sm text-slate-300">奖励金额（元）</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.config.bonusAmount || ""}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        config: { ...f.config, bonusAmount: e.target.value ? Number(e.target.value) : undefined }
                      }))}
                      className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                      placeholder="满足条件时的额外奖励金额"
                    />
                  </label>
                </div>
              )}

              {form.type === "formula" && (
                <label className="block space-y-1">
                  <span className="text-sm text-slate-300">计算公式</span>
                  <input
                    type="text"
                    value={form.config.formula || ""}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      config: { ...f.config, formula: e.target.value }
                    }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                    placeholder="如：amount * 0.05 + orders * 10"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    支持变量：amount（金额）、orders（订单数）、quantity（数量）等，使用 +、-、*、/ 运算符
                  </p>
                </label>
              )}

              <label className="block space-y-1">
                <span className="text-sm text-slate-300">规则说明</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-primary-400"
                  placeholder="描述这个规则的用途和计算方式"
                />
              </label>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  variant="secondary"
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  {editingRule ? "更新" : "创建"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
