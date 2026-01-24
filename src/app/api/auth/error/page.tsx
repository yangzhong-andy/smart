"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";

export default function AuthErrorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    // 3 秒后自动跳转到登录页
    const timer = setTimeout(() => {
      router.push("/login");
    }, 3000);

    return () => clearTimeout(timer);
  }, [router]);

  const getErrorMessage = (error: string | null) => {
    switch (error) {
      case "CredentialsSignin":
        return "邮箱或密码错误";
      case "Configuration":
        return "系统配置错误";
      case "AccessDenied":
        return "访问被拒绝";
      default:
        return "登录失败，请稍后重试";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-900/20 to-slate-800/50 p-8 shadow-2xl backdrop-blur-sm text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-100 mb-2">登录失败</h1>
          <p className="text-slate-300 mb-6">
            {getErrorMessage(error)}
          </p>
          <p className="text-sm text-slate-500">
            3 秒后自动跳转到登录页...
          </p>
          <button
            onClick={() => router.push("/login")}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            立即返回登录页
          </button>
        </div>
      </div>
    </div>
  );
}
