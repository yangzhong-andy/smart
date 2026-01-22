"use client";

import { useState } from "react";
import { generateTestData } from "@/lib/generate-test-data";
import { toast } from "sonner";
import { Database, Loader2, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

export default function GenerateTestDataPage() {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleGenerate = () => {
    if (!confirm("⚠️ 确定要生成测试数据吗？\n\n这将覆盖现有的部分数据（供应商、产品、账户、合同、拿货单、现金流等）。\n\n建议先备份现有数据！")) {
      return;
    }

    setLoading(true);
    setGenerated(false);

    try {
      generateTestData();
      setGenerated(true);
      toast.success("✅ 测试数据生成成功！请刷新页面查看。");
    } catch (error: any) {
      console.error("生成测试数据失败:", error);
      toast.error(`生成失败：${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6">
      <PageHeader
        title="生成测试数据"
        description="生成各种业务测试数据，用于验证系统功能"
      />

      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        {/* 说明卡片 */}
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-6">
          <div className="flex items-start gap-4">
            <Database className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-300 mb-2">
                测试数据生成工具
              </h3>
              <p className="text-blue-200/80 text-sm leading-relaxed mb-3">
                此工具将生成以下类型的测试数据：
              </p>
              <ul className="space-y-1 text-blue-200/70 text-sm list-disc list-inside">
                <li>供应商数据（12个）</li>
                <li>产品数据（15个）</li>
                <li>银行账户数据（6个）</li>
                <li>店铺数据（3个）</li>
                <li>采购合同数据（20个）</li>
                <li>拿货单数据（根据合同生成）</li>
                <li>现金流记录（多条）</li>
              </ul>
              <p className="mt-4 text-blue-300 font-medium text-sm">
                ⚠️ 注意：生成的数据会覆盖现有的对应数据，请谨慎操作！
              </p>
            </div>
          </div>
        </div>

        {/* 生成按钮 */}
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <Database className="w-5 h-5" />
                <span>生成测试数据</span>
              </>
            )}
          </button>
        </div>

        {/* 成功提示 */}
        {generated && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <div className="flex-1">
              <p className="text-green-300 font-medium">测试数据生成成功！</p>
              <p className="text-green-200/70 text-sm mt-1">
                请刷新页面查看生成的数据。数据已保存到 localStorage。
              </p>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-6">
          <h3 className="text-lg font-semibold text-slate-200 mb-4">
            使用说明
          </h3>
          <div className="space-y-3 text-sm text-slate-400">
            <div>
              <p className="font-medium text-slate-300 mb-1">方式一：通过页面生成（推荐）</p>
              <p>点击上方的"生成测试数据"按钮即可。</p>
            </div>
            <div>
               <p className="font-medium text-slate-300 mb-1">方式二：通过浏览器控制台执行</p>
              <p className="font-mono text-xs bg-slate-900/50 p-2 rounded mt-1">
                {`import('@/lib/generate-test-data').then(m => m.generateTestData())`}
              </p>
            </div>
            <div className="pt-3 border-t border-slate-700">
              <p className="text-slate-500 text-xs">
                💡 提示：生成的数据都是随机生成的，但保持了业务逻辑的合理性（如合同关联供应商、拿货单关联合同等）。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
