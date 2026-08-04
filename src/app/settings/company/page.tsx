"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Building2, Save } from "lucide-react";
import { toast } from "sonner";

type CompanyForm = {
  name: string;
  address: string;
  phone: string;
  contact: string;
  bankAccount: string;
  bankAccountName: string;
  bankName: string;
  taxId: string;
};

const emptyForm: CompanyForm = {
  name: "",
  address: "",
  phone: "",
  contact: "",
  bankAccount: "",
  bankAccountName: "",
  bankName: "",
  taxId: "",
};

const companyFetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error("未登录");
  return r.json();
};

export default function CompanySettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState<CompanyForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<CompanyForm>(
    session ? "/api/company" : null,
    companyFetcher,
    { revalidateOnFocus: false, dedupingInterval: 600000, keepPreviousData: true }
  );

  useEffect(() => {
    if (data) setForm({ ...emptyForm, ...data });
  }, [data]);

  if (status === "loading") return null;
  if (!session) {
    router.push("/login");
    return null;
  }

  const loading = isLoading && !data;
  if (error && !data) toast.error("加载公司信息失败");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((r) => {
        if (!r.ok) return r.json().then((j) => Promise.reject(new Error(j?.error || "保存失败")));
        return r.json();
      })
      .then((saved) => {
        toast.success("公司信息已保存，生成合同时将使用以上甲方信息。");
        mutate({ ...emptyForm, ...saved }, false);
      })
      .catch((err) => toast.error(err?.message || "保存失败"))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-slate-400">
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
          <Building2 className="h-7 w-7 text-primary-400" />
          本公司信息（甲方）
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          用于采购合同等单据的甲方信息，保存后生成合同时将自动带入。
        </p>
      </header>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-slate-300 text-sm">公司全称</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：某某科技有限公司"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-slate-300 text-sm">联系代表 / 签字人</span>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
              placeholder="合同签字人姓名"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-slate-300 text-sm">公司地址</span>
          <input
            type="text"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="详细地址"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-slate-300 text-sm">联系电话</span>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="座机或手机"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-slate-300 text-sm">税号（可选）</span>
            <input
              type="text"
              value={form.taxId}
              onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
              placeholder="统一社会信用代码 / 税号"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
            />
          </label>
        </div>

        <div className="border-t border-slate-800 pt-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">付款账户信息（用于合同）</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-slate-300 text-sm">户名</span>
              <input
                type="text"
                value={form.bankAccountName}
                onChange={(e) => setForm((f) => ({ ...f, bankAccountName: e.target.value }))}
                placeholder="开户名"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-slate-300 text-sm">账号</span>
              <input
                type="text"
                value={form.bankAccount}
                onChange={(e) => setForm((f) => ({ ...f, bankAccount: e.target.value }))}
                placeholder="银行卡号"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </label>
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-slate-300 text-sm">开户行</span>
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                placeholder="如：XX银行XX支行"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400"
              />
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-primary-600 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}
