"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isAuthenticated } from "@/lib/auth";

// 模拟登录账号（用于开发测试）
const MOCK_USERS = [
  { email: "admin@example.com", password: "admin123", name: "管理员" },
  { email: "test@example.com", password: "test123", name: "测试账号" },
  { email: "demo@example.com", password: "demo123", name: "演示账号" }
];

// 登录状态存储键
const AUTH_TOKEN_KEY = "auth_token";
const USER_INFO_KEY = "user_info";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  // 如果已经登录，重定向到首页
  useEffect(() => {
    if (isAuthenticated()) {
      router.push("/");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!form.email.trim() || !form.password.trim()) {
      toast.error("请填写邮箱和密码");
      return;
    }

    setLoading(true);

    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      // 模拟登录验证
      const user = MOCK_USERS.find(
        (u) => u.email.toLowerCase() === form.email.trim().toLowerCase() && u.password === form.password
      );

      if (!user) {
        toast.error("登录失败：邮箱或密码错误");
        setLoading(false);
        return;
      }

      // 模拟登录成功
      // 保存登录状态到 localStorage
      const authToken = `mock_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const userInfo = {
        email: user.email,
        name: user.name,
        loginTime: new Date().toISOString()
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
        window.localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo));
      }

      toast.success("欢迎回来，老板！");
      
      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 500);
    } catch (err: any) {
      toast.error(`登录失败：${err.message || "未知错误"}`);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 登录卡片 */}
        <div className="rounded-2xl border border-slate-800/50 bg-gradient-to-br from-slate-900/90 to-slate-800/50 p-8 shadow-2xl backdrop-blur-sm">
          {/* 标题 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-100 mb-2">
              水滴飞扬 SMART ERP
            </h1>
            <p className="text-slate-400 text-sm">欢迎登录系统</p>
          </div>

          {/* 登录表单 */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 邮箱输入框 */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                邮箱
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-700 bg-slate-900/50 text-slate-100 placeholder-slate-500 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-200"
                  placeholder="请输入邮箱地址"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* 密码输入框 */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-700 bg-slate-900/50 text-slate-100 placeholder-slate-500 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all duration-200"
                  placeholder="请输入密码"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* 登录按钮 */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold hover:from-blue-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <span>登录</span>
              )}
            </button>

            {/* 底部提示 */}
            <div className="mt-6 space-y-2">
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-xs font-medium text-blue-300 mb-2">测试账号（开发模式）：</p>
                <div className="space-y-1 text-xs text-blue-200/80">
                  <div>管理员：admin@example.com / admin123</div>
                  <div>测试账号：test@example.com / test123</div>
                  <div>演示账号：demo@example.com / demo123</div>
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center">
                如有问题，请联系系统管理员
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
