"use client";

import { useState, useEffect } from "react";
import { Factory, Package, ShoppingCart, TrendingUp, AlertCircle, Plus, Eye, Edit } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import Link from "next/link";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function SupplyChainDashboard() {
  const { data: purchaseOrdersRaw, isLoading: ordersLoading, mutate: mutateOrders } = useSWR('/api/purchase-orders?status=PENDING_RISK&page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const { data: suppliersRaw, isLoading: suppliersLoading } = useSWR('/api/suppliers?page=1&pageSize=500', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 600000,
  });
  const purchaseOrders = Array.isArray(purchaseOrdersRaw) ? purchaseOrdersRaw : (purchaseOrdersRaw?.data ?? []);
  const suppliers = Array.isArray(suppliersRaw) ? suppliersRaw : (suppliersRaw?.data ?? []);

  // 统计信息
  const stats = {
    pendingOrders: purchaseOrders.length,
    totalSuppliers: suppliers.length,
    activeSuppliers: suppliers.filter((s: any) => s.status === '启用').length,
  };

  return (
    <div className="min-h-screen p-6 space-y-6">
      {/* 页面标题 */}
      <div className="relative">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
        <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                全球供应链部
              </h1>
              <p className="text-white/70">待采购订单与供应商管理</p>
            </div>
            <div className="flex gap-3">
              <Link href="/procurement/purchase-orders">
                <button className="px-6 py-3 rounded-xl border border-white/20 bg-white/5 text-white hover:bg-white/10 transition-all duration-300 flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  采购管理
                </button>
              </Link>
              <Link href="/procurement/suppliers">
                <button className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white font-semibold hover:scale-105 transition-all duration-300 shadow-lg shadow-purple-500/30 flex items-center gap-2">
                  <Factory className="h-5 w-5" />
                  供应商管理
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          title="待采购订单"
          value={stats.pendingOrders}
          icon={ShoppingCart}
          gradient="from-amber-500/20 to-amber-600/10"
          borderColor="border-amber-500/30"
        />
        <StatCard
          title="供应商总数"
          value={stats.totalSuppliers}
          icon={Factory}
          gradient="from-blue-500/20 to-blue-600/10"
          borderColor="border-blue-500/30"
        />
        <StatCard
          title="活跃供应商"
          value={stats.activeSuppliers}
          icon={TrendingUp}
          gradient="from-emerald-500/20 to-emerald-600/10"
          borderColor="border-emerald-500/30"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 待采购表格 */}
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
          <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              待采购订单
            </h2>
            
            {ordersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-purple-400"></div>
              </div>
            ) : purchaseOrders.length === 0 ? (
              <div className="text-center py-12 text-white/50">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>暂无待采购订单</p>
              </div>
            ) : (
              <div className="space-y-3">
                {purchaseOrders.slice(0, 5).map((order: any) => (
                  <OrderCard key={order.id} order={order} />
                ))}
                {purchaseOrders.length > 5 && (
                  <Link href="/procurement/purchase-orders">
                    <button className="w-full py-2 px-4 rounded-xl border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm">
                      查看全部 ({purchaseOrders.length})
                    </button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 供应商管理工具 */}
        <div className="relative">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur opacity-20"></div>
          <div className="relative rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Factory className="h-5 w-5" />
              供应商管理
            </h2>
            
            {suppliersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-purple-400"></div>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-12 text-white/50">
                <Factory className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>暂无供应商</p>
                <Link href="/procurement/suppliers">
                  <button className="mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm hover:scale-105 transition-all">
                    添加供应商
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {suppliers.slice(0, 5).map((supplier: any) => (
                  <SupplierCard key={supplier.id} supplier={supplier} />
                ))}
                {suppliers.length > 5 && (
                  <Link href="/procurement/suppliers">
                    <button className="w-full py-2 px-4 rounded-xl border border-white/20 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm">
                      查看全部 ({suppliers.length})
                    </button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, gradient, borderColor }: any) {
  return (
    <div className={`rounded-xl border ${borderColor} bg-gradient-to-br ${gradient} p-5 backdrop-blur-sm hover:scale-105 transition-all duration-300 shadow-lg`}>
      <div className="flex items-center justify-between mb-3">
        <Icon className="h-5 w-5 text-white/80" />
        <div className="text-xs text-white/50">{title}</div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function OrderCard({ order }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:bg-white/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm">{order.orderNumber}</h3>
          <p className="text-white/60 text-xs mt-1">{order.productName || order.sku}</p>
        </div>
        <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-300">
          待采购
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>数量: {order.quantity}</span>
        <span>{order.storeName || '-'}</span>
      </div>
    </div>
  );
}

function SupplierCard({ supplier }: any) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:bg-white/10 transition-all duration-300">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm">{supplier.name}</h3>
          <p className="text-white/60 text-xs mt-1">{supplier.contact || supplier.phone || '-'}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs ${supplier.status === '启用' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'}`}>
          {supplier.status || '未知'}
        </span>
      </div>
      {supplier.level && (
        <div className="text-xs text-white/50 mt-2">
          等级: {supplier.level}
        </div>
      )}
    </div>
  );
}
