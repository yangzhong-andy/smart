"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

// TikTok 和 Amazon 图标组件
const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

const AmazonIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M6.763 12.025c-.11-.302-.055-.612.11-.872.11-.22.275-.385.495-.495.22-.11.44-.165.66-.165.275 0 .55.11.77.275.22.165.385.385.495.66.055.11.055.275.055.385 0 .11-.055.22-.11.33-.11.22-.275.385-.495.495-.22.11-.44.165-.66.165-.275 0-.55-.11-.77-.275-.22-.165-.385-.385-.495-.66zm.66.55c.055.11.165.165.275.165.11 0 .22-.055.275-.165.055-.11.055-.22.055-.33 0-.11-.055-.22-.11-.33-.055-.11-.165-.165-.275-.165-.11 0-.22.055-.275.165-.055.11-.055.22-.055.33 0 .11.055.22.11.33zm8.25-1.1c-.11-.22-.275-.385-.495-.495-.22-.11-.44-.165-.66-.165-.275 0-.55.11-.77.275-.22.165-.385.385-.495.66-.055.11-.055.275-.055.385 0 .11.055.22.11.33.11.22.275.385.495.495.22.11.44.165.66.165.275 0 .55-.11.77-.275.22-.165.385-.385.495-.66.055-.11.055-.275.055-.385 0-.11-.055-.22-.11-.33z"/>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z"/>
    <path d="M12 6c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6zm0 10c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/>
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  // 如果已经登录，重定向到首页
  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push("/");
    }
  }, [session, status, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Form submit handler called');
    
    if (!form.email.trim() || !form.password.trim()) {
      toast.error("请填写邮箱和密码");
      return;
    }

    console.log('Starting login process...');
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: form.email.trim(),
        password: form.password,
        redirect: false
      });

      if (result?.error) {
        toast.error(result.error);
        setLoading(false);
        return;
      }

      if (result?.ok) {
        toast.success("登录成功！");
        // 延迟跳转，让用户看到成功提示
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 500);
      }
    } catch (err: any) {
      toast.error(`登录失败：${err.message || "未知错误"}`);
      setLoading(false);
    }
  };

  return (
    <div 
      data-login-page
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ 
        backgroundColor: '#020617',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999
      }}
    >
      {/* 深空背景层 - 动态光晕 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-[160px] animate-gradient-drift"
          style={{ backgroundColor: "#1e1b4b" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-[160px] opacity-20 animate-gradient-drift"
          style={{ backgroundColor: "#2e1065", animationDelay: "-4s" }}
        />
        {/* 浮动光点 */}
        <div className="absolute top-1/4 left-1/3 w-2 h-2 rounded-full bg-cyan-400/40 animate-float" style={{ animationDelay: "0s" }} />
        <div className="absolute top-1/2 right-1/4 w-1.5 h-1.5 rounded-full bg-slate-400/30 animate-float" style={{ animationDelay: "-2s" }} />
        <div className="absolute bottom-1/3 left-1/4 w-1 h-1 rounded-full bg-cyan-300/30 animate-float" style={{ animationDelay: "-4s" }} />
      </div>

      {/* 科技纹理 - 网格线 */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      <div className="w-full max-w-md relative z-10 pointer-events-auto">
        {/* 极致磨砂卡片 - 入场动画 + 呼吸光晕 */}
        <div className="relative rounded-2xl bg-slate-900/40 backdrop-blur-3xl p-8 shadow-2xl border border-white/10 overflow-hidden pointer-events-auto animate-card-in animate-glow-pulse">
          {/* 顶部和左侧高光 */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="absolute top-0 left-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

          {/* 标题 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 tracking-wider bg-gradient-to-r from-slate-100 to-cyan-400 bg-clip-text text-transparent">
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
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-700/50 bg-black/30 text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30 transition-all duration-300"
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
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-700/50 bg-black/30 text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30 transition-all duration-300"
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
              onClick={(e) => {
                if (!loading) {
                  console.log("Form will submit");
                }
              }}
              className="w-full py-3 px-4 rounded-lg bg-cyan-600 text-white font-semibold hover:bg-cyan-500 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-300 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 flex items-center justify-center gap-2 relative z-50"
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

            <p className="mt-6 text-xs text-slate-500 text-center">
              如有问题，请联系系统管理员
            </p>
          </form>

          {/* 跨境标识 */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <div className="flex items-center justify-center gap-4 mb-2">
              <div className="flex items-center gap-2 text-slate-400/60">
                <TikTokIcon />
                <span className="text-xs font-medium">TikTok Shop</span>
              </div>
              <div className="w-px h-4 bg-slate-600/50" />
              <div className="flex items-center gap-2 text-slate-400/60">
                <AmazonIcon />
                <span className="text-xs font-medium">Amazon</span>
              </div>
            </div>
            <p className="text-xs text-slate-500/70 text-center tracking-wide">
              Global E-commerce Finance Integration
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
