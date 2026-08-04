"use client";

import { useState, useEffect } from "react";
import { Plus, Trash, Package } from "lucide-react";
import { useSystemConfirm } from "@/hooks/use-system-confirm";

type BoxSpec = {
  id: string;
  variantId: string;
  boxLengthCm: number | null;
  boxWidthCm: number | null;
  boxHeightCm: number | null;
  qtyPerBox: number;
  isDefault: boolean;
  weightKg: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type BoxSpecFormProps = {
  variantId: string | null;
};

export function BoxSpecForm({ variantId }: BoxSpecFormProps) {
  const { confirm, confirmDialog } = useSystemConfirm();
  const [boxSpecs, setBoxSpecs] = useState<BoxSpec[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 表单状态
  const [form, setForm] = useState({
    boxLengthCm: "",
    boxWidthCm: "",
    boxHeightCm: "",
    qtyPerBox: "",
    isDefault: false,
    weightKg: "",
  });

  // 加载箱规列表
  useEffect(() => {
    if (!variantId) return;
    loadBoxSpecs();
  }, [variantId]);

  const loadBoxSpecs = async () => {
    if (!variantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/box-spec?variantId=${variantId}`);
      if (res.ok) {
        const data = await res.json();
        setBoxSpecs(data);
      }
    } catch (e) {
      console.error("加载箱规失败", e);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!variantId) return;

    const payload = {
      variantId,
      boxLengthCm: form.boxLengthCm ? parseFloat(form.boxLengthCm) : null,
      boxWidthCm: form.boxWidthCm ? parseFloat(form.boxWidthCm) : null,
      boxHeightCm: form.boxHeightCm ? parseFloat(form.boxHeightCm) : null,
      qtyPerBox: parseInt(form.qtyPerBox),
      isDefault: form.isDefault,
      weightKg: form.weightKg ? parseFloat(form.weightKg) : null,
    };

    const url = editingId ? `/api/box-spec` : "/api/box-spec";
    const method = editingId ? "PUT" : "POST";
    const body = editingId ? { id: editingId, ...payload } : payload;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setForm({ boxLengthCm: "", boxWidthCm: "", boxHeightCm: "", qtyPerBox: "", isDefault: false, weightKg: "" });
        setShowForm(false);
        setEditingId(null);
        loadBoxSpecs();
      }
    } catch (e) {
      console.error("保存箱规失败", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: "删除确认", message: "确定删除该箱规？", type: "warning" }))) return;
    try {
      const res = await fetch(`/api/box-spec?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        loadBoxSpecs();
      }
    } catch (e) {
      console.error("删除失败", e);
    }
  };

  const handleEdit = (spec: BoxSpec) => {
    setForm({
      boxLengthCm: spec.boxLengthCm?.toString() || "",
      boxWidthCm: spec.boxWidthCm?.toString() || "",
      boxHeightCm: spec.boxHeightCm?.toString() || "",
      qtyPerBox: spec.qtyPerBox?.toString() || "",
      isDefault: spec.isDefault,
      weightKg: spec.weightKg?.toString() || "",
    });
    setEditingId(spec.id);
    setShowForm(true);
  };

  if (!variantId) {
    return (
      <div className="text-sm text-slate-500 p-4 text-center border border-dashed border-slate-700 rounded-lg">
        保存产品后可添加箱规
      </div>
    );
  }

  return (
    <div className="border-t border-slate-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-slate-300 font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          箱规管理
        </h3>
        <button
          type="button"
          onClick={() => {
            setForm({ boxLengthCm: "", boxWidthCm: "", boxHeightCm: "", qtyPerBox: "", isDefault: false, weightKg: "" });
            setEditingId(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-cyan-500/50 bg-cyan-500/10 text-xs text-cyan-200 hover:bg-cyan-500/20"
        >
          <Plus className="h-3 w-3" />
          添加箱规
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 text-center py-4">加载中...</div>
      ) : boxSpecs.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-4 border border-dashed border-slate-700 rounded-lg">
          暂无箱规，点击"添加箱规"开始添加
        </div>
      ) : (
        <div className="space-y-2">
          {boxSpecs.map((spec) => (
            <div key={spec.id} className="p-3 rounded-lg border border-slate-700 bg-slate-900/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {spec.isDefault && (
                  <span className="px-2 py-0.5 rounded text-xs bg-primary-500/20 text-primary-300">
                    默认
                  </span>
                )}
                <div className="text-sm text-slate-300">
                  <span className="font-medium">{spec.qtyPerBox}</span> 个/箱
                  {spec.boxLengthCm && spec.boxWidthCm && spec.boxHeightCm && (
                    <span className="text-slate-500 ml-2">
                      ({spec.boxLengthCm}×{spec.boxWidthCm}×{spec.boxHeightCm} cm)
                    </span>
                  )}
                  {spec.weightKg && (
                    <span className="text-slate-500 ml-2">{spec.weightKg} kg</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEdit(spec)}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(spec.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑表单 */}
      {showForm && (
        <div className="mt-4 p-4 rounded-lg border border-slate-700 bg-slate-900/50">
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            {editingId ? "编辑箱规" : "添加箱规"}
          </h4>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">箱长 (cm)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.boxLengthCm}
                  onChange={(e) => setForm((f) => ({ ...f, boxLengthCm: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
                  placeholder="0"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">箱宽 (cm)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.boxWidthCm}
                  onChange={(e) => setForm((f) => ({ ...f, boxWidthCm: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
                  placeholder="0"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">箱高 (cm)</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={form.boxHeightCm}
                  onChange={(e) => setForm((f) => ({ ...f, boxHeightCm: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
                  placeholder="0"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">每箱数量 <span className="text-rose-400">*</span></span>
                <input
                  type="number"
                  min={1}
                  value={form.qtyPerBox}
                  onChange={(e) => setForm((f) => ({ ...f, qtyPerBox: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
                  placeholder="如：50"
                  required
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-slate-400">箱重 (kg)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.weightKg}
                  onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm"
                  placeholder="0"
                />
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-primary-500 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm text-slate-300">设为默认</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm({ boxLengthCm: "", boxWidthCm: "", boxHeightCm: "", qtyPerBox: "", isDefault: false, weightKg: "" });
                }}
                className="px-3 py-1.5 rounded-md border border-slate-700 text-sm text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="px-3 py-1.5 rounded-md bg-primary-500 text-sm text-white hover:bg-primary-600"
              >
                {editingId ? "更新" : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}