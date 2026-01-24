"use client";

import { ReactNode } from "react";
import { useSession } from "next-auth/react";
import ContentProductionDashboard from "./dashboards/ContentProductionDashboard";
import SupplyChainDashboard from "./dashboards/SupplyChainDashboard";
import FinanceDashboard from "./dashboards/FinanceDashboard";

interface DashboardLayoutProps {
  children?: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { data: session } = useSession();
  const departmentName = session?.user?.departmentName || null;

  // 根据部门名称渲染不同的工作台
  const renderDashboard = () => {
    switch (departmentName) {
      case "内容生产工厂":
        return <ContentProductionDashboard />;
      case "全球供应链部":
        return <SupplyChainDashboard />;
      case "财经中心":
        return <FinanceDashboard />;
      default:
        // 默认显示通用工作台或提示
        return (
          <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-6">
            <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-8 shadow-2xl max-w-md w-full text-center">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                欢迎使用 SMART ERP
              </h2>
              <p className="text-white/70 mb-6">
                {departmentName 
                  ? `您的部门"${departmentName}"暂未配置专属工作台`
                  : "您尚未分配部门，请联系管理员"}
              </p>
              {children}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* 动态渐变背景 */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 animate-gradient-shift"></div>
      
      {/* 背景装饰 - 浮动光球 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-pink-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* 网格背景 */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      {/* 内容区域 */}
      <div className="relative z-10">
        {renderDashboard()}
      </div>

      {/* 添加自定义动画样式 */}
      <style jsx global>{`
        @keyframes gradient-shift {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient-shift {
          background-size: 200% 200%;
          animation: gradient-shift 15s ease infinite;
        }
        .delay-1000 {
          animation-delay: 1s;
        }
        .delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}
