"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Building2, Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useSystemConfirm } from "@/hooks/use-system-confirm";

type Exporter = {
  id: string;
  name: string;
  country: string;
  companyType: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const emptyForm = {
  name: "",
  country: "CN",
  companyType: "exporter",
  contact: "",
  phone: "",
  email: "",
  address: "",
  taxId: "",
  bankName: "",
  bankAccount: "",
  notes: "",
  isActive: true,
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ExportersPage() {
  const { confirm, confirmDialog } = useSystemConfirm();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<{ data: Exporter[]; pagination: any }>(
    session ? "/api/exporters?pageSize=100" : null,
    fetcher
  );

  const exporters = data?.data || [];

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading") return null;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (exporter: Exporter) => {
    setEditingId(exporter.id);
    setForm({
      name: exporter.name,
      country: exporter.country,
      companyType: exporter.companyType,
      contact: exporter.contact || "",
      phone: exporter.phone || "",
      email: exporter.email || "",
      address: exporter.address || "",
      taxId: exporter.taxId || "",
      bankName: exporter.bankName || "",
      bankAccount: exporter.bankAccount || "",
      notes: exporter.notes || "",
      isActive: exporter.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("请填写公司名称");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/exporters/${editingId}` : "/api/exporters";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "保存失败");
      }
      toast.success(editingId ? "已更新" : "已创建");
      setIsModalOpen(false);
      mutate();
    } catch (err: any) {
      toast.error(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: "删除确认", message: "确定删除该公司？", type: "danger" }))) return;
    try {
      const res = await fetch(`/api/exporters/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      toast.success("已删除");
      mutate();
    } catch (err) {
      toast.error("删除失败");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary-400" />
            出口公司管理
          </h1>
          <p className="mt-1 text-sm text-slate-400">管理国内出口公司信息</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          <Plus className="h-4 w-4" />
          新增出口公司
        </button>
      </header>

      {/* 列表 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">公司名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">国家</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">联系人</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">税号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">状态</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">加载中...</td>
              </tr>
            ) : exporters.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无数据</td>
              </tr>
            ) : (
              exporters.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm text-slate-200">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{item.country}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{item.contact || "-"}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{item.taxId || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${item.isActive ? "text-emerald-400" : "text-slate-500"}`}>
                      {item.isActive ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(item)} className="p-1 text-slate-400 hover:text-primary-400">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-1 text-slate-400 hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingId ? "编辑出口公司" : "新增出口公司"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">公司名称 *</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                    placeholder="必填"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">国家</span>
                  <input
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                    placeholder="CN"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">联系人</span>
                  <input
                    value={form.contact}
                    onChange={(e) => setForm({ ...form, contact: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">电话</span>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">邮箱</span>
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">税号</span>
                  <input
                    value={form.taxId}
                    onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-xs text-slate-300">地址</span>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">银行名称</span>
                  <input
                    value={form.bankName}
                    onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-slate-300">银行账号</span>
                  <input
                    value={form.bankAccount}
                    onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="space-y-1 col-span-2">
                  <span className="text-xs text-slate-300">备注</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-primary-400"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="rounded border-slate-600 bg-slate-900 text-primary-500"
                  />
                  <span className="text-sm text-slate-300">启用</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
