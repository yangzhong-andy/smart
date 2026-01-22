"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  UserPlus,
  Package,
  TrendingUp,
  Mail,
  Phone,
  Globe,
  Edit,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  Users,
  BarChart3
} from "lucide-react";
import {
  getInfluencers,
  saveInfluencers,
  upsertInfluencer,
  deleteInfluencer,
  confirmSample,
  updateTracking,
  calculateEstimatedOrders,
  getInfluencerStats,
  type InfluencerBD,
  type CooperationStatus,
  type SampleStatus
} from "@/lib/influencer-bd-store";
import { getProducts } from "@/lib/products-store";
import { StatCard, ActionButton, PageHeader, SearchBar, EmptyState } from "@/components/ui";

// 格式化粉丝数
const formatFollowerCount = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

// 获取状态对应的背景色
const getStatusColor = (status: CooperationStatus | SampleStatus): string => {
  const colorMap: Record<string, string> = {
    待寄样: "linear-gradient(135deg, #64748b 0%, #0f172a 100%)",
    创作中: "linear-gradient(135deg, #3b82f6 0%, #0f172a 100%)",
    已发布: "linear-gradient(135deg, #10b981 0%, #0f172a 100%)",
    已结束: "linear-gradient(135deg, #6b7280 0%, #0f172a 100%)",
    暂停合作: "linear-gradient(135deg, #ef4444 0%, #0f172a 100%)",
    已寄样: "linear-gradient(135deg, #3b82f6 0%, #0f172a 100%)",
    运输中: "linear-gradient(135deg, #f59e0b 0%, #0f172a 100%)",
    已签收: "linear-gradient(135deg, #10b981 0%, #0f172a 100%)",
    已拒收: "linear-gradient(135deg, #ef4444 0%, #0f172a 100%)"
  };
  return colorMap[status] || "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)";
};

export default function InfluencersPage() {
  const router = useRouter();
  const [influencers, setInfluencers] = useState<InfluencerBD[]>([]);
  const [influencersReady, setInfluencersReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [editingInfluencer, setEditingInfluencer] = useState<InfluencerBD | null>(null);
  const [selectedInfluencer, setSelectedInfluencer] = useState<InfluencerBD | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [products, setProducts] = useState<any[]>([]);

  const [form, setForm] = useState({
    accountName: "",
    platform: "TikTok" as InfluencerBD["platform"],
    accountUrl: "",
    followerCount: 0,
    contactInfo: "",
    category: "",
    cooperationStatus: "待寄样" as CooperationStatus,
    sampleStatus: "待寄样" as SampleStatus,
    historicalEngagementRate: 3,
    notes: ""
  });

  const [sampleForm, setSampleForm] = useState({
    productSku: "",
    sampleOrderNumber: ""
  });

  const [trackingForm, setTrackingForm] = useState({
    trackingNumber: "",
    status: "运输中" as SampleStatus
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loaded = getInfluencers();
    setInfluencers(loaded);
    setInfluencersReady(true);
    
    const loadedProducts = getProducts();
    setProducts(loadedProducts);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!influencersReady) return;
    saveInfluencers(influencers);
  }, [influencers, influencersReady]);

  // 统计数据
  const stats = useMemo(() => getInfluencerStats(), [influencers]);

  // 搜索和筛选
  const filteredInfluencers = useMemo(() => {
    let filtered = influencers;

    // 搜索
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (i) =>
          i.accountName.toLowerCase().includes(query) ||
          i.contactInfo.toLowerCase().includes(query) ||
          i.category.toLowerCase().includes(query) ||
          (i.sampleOrderNumber && i.sampleOrderNumber.toLowerCase().includes(query))
      );
    }

    // 状态筛选
    if (filterStatus !== "all") {
      filtered = filtered.filter((i) => i.cooperationStatus === filterStatus);
    }

    return filtered;
  }, [influencers, searchQuery, filterStatus]);

  const resetForm = () => {
    setForm({
      accountName: "",
      platform: "TikTok",
      accountUrl: "",
      followerCount: 0,
      contactInfo: "",
      category: "",
      cooperationStatus: "待寄样",
      sampleStatus: "待寄样",
      historicalEngagementRate: 3,
      notes: ""
    });
    setEditingInfluencer(null);
  };

  const handleOpenModal = (influencer?: InfluencerBD) => {
    if (influencer) {
      setEditingInfluencer(influencer);
      setForm({
        accountName: influencer.accountName,
        platform: influencer.platform,
        accountUrl: influencer.accountUrl || "",
        followerCount: influencer.followerCount,
        contactInfo: influencer.contactInfo,
        category: influencer.category,
        cooperationStatus: influencer.cooperationStatus,
        sampleStatus: influencer.sampleStatus,
        historicalEngagementRate: influencer.historicalEngagementRate || 3,
        notes: influencer.notes || ""
      });
    } else {
      resetForm();
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.accountName.trim() || !form.contactInfo.trim()) {
      toast.error("请填写达人账号和联系方式");
      return;
    }

    const influencerData: InfluencerBD = {
      id: editingInfluencer?.id || crypto.randomUUID(),
      ...form,
      sampleOrderNumber: editingInfluencer?.sampleOrderNumber,
      sampleTrackingNumber: editingInfluencer?.sampleTrackingNumber,
      sampleProductSku: editingInfluencer?.sampleProductSku,
      sampleSentAt: editingInfluencer?.sampleSentAt,
      sampleReceivedAt: editingInfluencer?.sampleReceivedAt,
      estimatedOrders: calculateEstimatedOrders(
        form.followerCount,
        form.historicalEngagementRate
      ),
      createdAt: editingInfluencer?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    upsertInfluencer(influencerData);
    setInfluencers(getInfluencers());
    toast.success(editingInfluencer ? "达人信息已更新" : "达人已创建");
    resetForm();
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm("⚠️ 确定要删除这个达人吗？\n此操作不可恢复！")) return;

    if (deleteInfluencer(id)) {
      setInfluencers(getInfluencers());
      toast.success("达人已删除");
    } else {
      toast.error("删除失败");
    }
  };

  const handleOpenSampleModal = (influencer: InfluencerBD) => {
    setSelectedInfluencer(influencer);
    setSampleForm({
      productSku: "",
      sampleOrderNumber: `SAMPLE-${new Date().getTime()}`
    });
    setIsSampleModalOpen(true);
  };

  const handleConfirmSample = () => {
    if (!selectedInfluencer || !sampleForm.productSku || !sampleForm.sampleOrderNumber) {
      toast.error("请选择产品和填写寄样单号");
      return;
    }

    const result = confirmSample(
      selectedInfluencer.id,
      sampleForm.productSku,
      sampleForm.sampleOrderNumber
    );

    if (result.success) {
      setInfluencers(getInfluencers());
      setProducts(getProducts());
      toast.success(result.message);
      setIsSampleModalOpen(false);
      setSelectedInfluencer(null);
    } else {
      toast.error(result.message);
    }
  };

  const handleOpenTrackingModal = (influencer: InfluencerBD) => {
    setSelectedInfluencer(influencer);
    setTrackingForm({
      trackingNumber: influencer.sampleTrackingNumber || "",
      status: influencer.sampleStatus
    });
    setIsTrackingModalOpen(true);
  };

  const handleUpdateTracking = () => {
    if (!selectedInfluencer || !trackingForm.trackingNumber) {
      toast.error("请填写物流单号");
      return;
    }

    updateTracking(selectedInfluencer.id, trackingForm.trackingNumber, trackingForm.status);
    setInfluencers(getInfluencers());
    toast.success("物流信息已更新");
    
    if (trackingForm.status === "已签收") {
      toast("寄样已签收，请及时跟进达人创作进度", { duration: 5000 });
    }
    
    setIsTrackingModalOpen(false);
    setSelectedInfluencer(null);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="达人 BD 管理"
        description="管理达人账号、寄样追踪、合作状态，智能预测推广效果"
        actions={
          <>
            <ActionButton variant="secondary">导出数据</ActionButton>
            <ActionButton variant="primary" icon={UserPlus} onClick={() => handleOpenModal()}>
              新增达人
            </ActionButton>
          </>
        }
      />

      {/* 统计面板 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          title="总达人数"
          value={stats.total}
          icon={Users}
          gradient="linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)"
        />
        <StatCard
          title="待寄样"
          value={stats.pendingSample}
          icon={Package}
          gradient="linear-gradient(135deg, #64748b 0%, #0f172a 100%)"
        />
        <StatCard
          title="创作中"
          value={stats.creating}
          icon={Clock}
          gradient="linear-gradient(135deg, #3b82f6 0%, #0f172a 100%)"
        />
        <StatCard
          title="运输中"
          value={stats.inTransit}
          icon={TrendingUp}
          gradient="linear-gradient(135deg, #f59e0b 0%, #0f172a 100%)"
        />
        <StatCard
          title="已签收"
          value={stats.received}
          icon={CheckCircle}
          gradient="linear-gradient(135deg, #10b981 0%, #0f172a 100%)"
        />
      </div>

      {/* 搜索和筛选 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索达人账号、联系方式、类目..."
          className="flex-1"
        />
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="all">全部状态</option>
            <option value="待寄样">待寄样</option>
            <option value="创作中">创作中</option>
            <option value="已发布">已发布</option>
            <option value="已结束">已结束</option>
            <option value="暂停合作">暂停合作</option>
          </select>
        </div>
      </div>

      {/* 达人卡片网格 */}
      {filteredInfluencers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searchQuery ? "未找到匹配的达人" : "暂无达人"}
          description={searchQuery ? "尝试调整搜索条件" : "点击右上角「新增达人」开始添加"}
          action={
            !searchQuery && (
              <ActionButton variant="primary" icon={UserPlus} onClick={() => handleOpenModal()}>
                新增达人
              </ActionButton>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredInfluencers.map((influencer) => {
            const estimatedOrders = influencer.estimatedOrders || 
              calculateEstimatedOrders(influencer.followerCount, influencer.historicalEngagementRate || 3);
            
            return (
              <div
                key={influencer.id}
                className="relative overflow-hidden rounded-2xl border transition-all hover:scale-[1.02] hover:shadow-xl"
                style={{
                  background: getStatusColor(influencer.cooperationStatus),
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)"
                }}
              >
                {/* 操作按钮 */}
                <div className="absolute top-3 right-3 flex gap-2 z-30">
                  <button
                    onClick={() => handleOpenModal(influencer)}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    title="编辑"
                  >
                    <Edit className="h-4 w-4 text-white" />
                  </button>
                  <button
                    onClick={() => handleDelete(influencer.id)}
                    className="p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </button>
                </div>

                {/* 卡片内容 */}
                <div className="p-5 relative z-10">
                  {/* 头部 */}
                  <div className="mb-4">
                    <h3 className="text-lg font-bold text-white mb-1">{influencer.accountName}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="px-2 py-0.5 rounded-full bg-white/10">
                        {influencer.platform}
                      </span>
                      <span className="text-slate-400">
                        {formatFollowerCount(influencer.followerCount)} 粉丝
                      </span>
                    </div>
                  </div>

                  {/* 信息 */}
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center gap-2 text-slate-300">
                      <Phone className="h-4 w-4 text-slate-400" />
                      <span className="truncate">{influencer.contactInfo}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-300">
                      <BarChart3 className="h-4 w-4 text-slate-400" />
                      <span>{influencer.category}</span>
                    </div>
                    {influencer.accountUrl && (
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-slate-400" />
                        <a
                          href={influencer.accountUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:text-primary-300 text-xs truncate"
                        >
                          查看账号
                        </a>
                      </div>
                    )}
                  </div>

                  {/* 状态标签 */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white font-medium">
                      {influencer.cooperationStatus}
                    </span>
                    <span className="px-2 py-1 rounded-lg bg-white/10 text-xs text-white font-medium">
                      {influencer.sampleStatus}
                    </span>
                  </div>

                  {/* 效果预测 */}
                  {influencer.historicalEngagementRate && (
                    <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-slate-400 mb-1">效果预测</div>
                      <div className="text-lg font-bold text-primary-300">
                        {estimatedOrders} 单
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        互动率 {influencer.historicalEngagementRate}% | 转化率 0.5%
                      </div>
                    </div>
                  )}

                  {/* 寄样信息 */}
                  {influencer.sampleOrderNumber && (
                    <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-slate-400 mb-1">寄样单号</div>
                      <div className="text-sm font-mono text-white">{influencer.sampleOrderNumber}</div>
                      {influencer.sampleTrackingNumber && (
                        <div className="text-xs text-slate-400 mt-1">
                          物流: {influencer.sampleTrackingNumber}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    {influencer.sampleStatus === "待寄样" && (
                      <ActionButton
                        variant="primary"
                        size="sm"
                        icon={Send}
                        onClick={() => handleOpenSampleModal(influencer)}
                        className="flex-1"
                      >
                        确认寄样
                      </ActionButton>
                    )}
                    {influencer.sampleStatus === "已寄样" && !influencer.sampleTrackingNumber && (
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={Package}
                        onClick={() => handleOpenTrackingModal(influencer)}
                        className="flex-1"
                      >
                        更新物流
                      </ActionButton>
                    )}
                    {influencer.sampleStatus === "运输中" && (
                      <ActionButton
                        variant="secondary"
                        size="sm"
                        icon={CheckCircle}
                        onClick={() => {
                          setSelectedInfluencer(influencer);
                          setTrackingForm({
                            trackingNumber: influencer.sampleTrackingNumber || "",
                            status: "已签收"
                          });
                          handleUpdateTracking();
                        }}
                        className="flex-1"
                      >
                        确认签收
                      </ActionButton>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新增/编辑模态框 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {editingInfluencer ? "编辑达人" : "新增达人"}
                </h2>
                <p className="text-xs text-slate-400 mt-1">录入达人信息，用于寄样和合作管理</p>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1 block col-span-2">
                  <span className="text-slate-300">达人账号 <span className="text-rose-400">*</span></span>
                  <input
                    value={form.accountName}
                    onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                    required
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">平台</span>
                  <select
                    value={form.platform}
                    onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value as InfluencerBD["platform"] }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  >
                    <option value="TikTok">TikTok</option>
                    <option value="Instagram">Instagram</option>
                    <option value="YouTube">YouTube</option>
                    <option value="其他">其他</option>
                  </select>
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">粉丝数</span>
                  <input
                    type="number"
                    value={form.followerCount}
                    onChange={(e) => setForm((f) => ({ ...f, followerCount: parseInt(e.target.value) || 0 }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  />
                </label>
                <label className="space-y-1 block col-span-2">
                  <span className="text-slate-300">联系方式 <span className="text-rose-400">*</span></span>
                  <input
                    value={form.contactInfo}
                    onChange={(e) => setForm((f) => ({ ...f, contactInfo: e.target.value }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                    required
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">所属类目</span>
                  <input
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="如：美妆、服装、3C"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-slate-300">历史互动率 (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.historicalEngagementRate}
                    onChange={(e) => setForm((f) => ({ ...f, historicalEngagementRate: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  />
                </label>
                <label className="space-y-1 block col-span-2">
                  <span className="text-slate-300">账号链接</span>
                  <input
                    type="url"
                    value={form.accountUrl}
                    onChange={(e) => setForm((f) => ({ ...f, accountUrl: e.target.value }))}
                    placeholder="https://..."
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  />
                </label>
                <label className="space-y-1 block col-span-2">
                  <span className="text-slate-300">备注</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                >
                  取消
                </ActionButton>
                <ActionButton type="submit" variant="primary">
                  {editingInfluencer ? "更新" : "保存"}
                </ActionButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 确认寄样模态框 */}
      {isSampleModalOpen && selectedInfluencer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">确认寄样</h2>
              <button
                onClick={() => setIsSampleModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-slate-300 text-sm mb-2 block">选择产品</label>
                <select
                  value={sampleForm.productSku}
                  onChange={(e) => setSampleForm((f) => ({ ...f, productSku: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                >
                  <option value="">请选择产品</option>
                  {products
                    .filter((p) => (p.at_domestic || 0) > 0)
                    .map((p) => (
                      <option key={p.sku_id} value={p.sku_id}>
                        {p.name} (SKU: {p.sku_id}) - 库存: {p.at_domestic || 0}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-2 block">寄样单号</label>
                <input
                  value={sampleForm.sampleOrderNumber}
                  onChange={(e) => setSampleForm((f) => ({ ...f, sampleOrderNumber: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <ActionButton variant="secondary" onClick={() => setIsSampleModalOpen(false)}>
                  取消
                </ActionButton>
                <ActionButton variant="primary" onClick={handleConfirmSample}>
                  确认寄样
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 更新物流模态框 */}
      {isTrackingModalOpen && selectedInfluencer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-100">更新物流信息</h2>
              <button
                onClick={() => setIsTrackingModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-slate-300 text-sm mb-2 block">物流单号</label>
                <input
                  value={trackingForm.trackingNumber}
                  onChange={(e) => setTrackingForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                />
              </div>
              <div>
                <label className="text-slate-300 text-sm mb-2 block">物流状态</label>
                <select
                  value={trackingForm.status}
                  onChange={(e) => setTrackingForm((f) => ({ ...f, status: e.target.value as SampleStatus }))}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none transition-all focus:border-primary-400 focus:ring-2 focus:ring-primary-400/30"
                >
                  <option value="运输中">运输中</option>
                  <option value="已签收">已签收</option>
                  <option value="已拒收">已拒收</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <ActionButton variant="secondary" onClick={() => setIsTrackingModalOpen(false)}>
                  取消
                </ActionButton>
                <ActionButton variant="primary" onClick={handleUpdateTracking}>
                  更新
                </ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
