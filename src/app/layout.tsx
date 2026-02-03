import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import LayoutWrapper from "./layout-wrapper";

export const metadata: Metadata = {
  title: "Smart ERP - 国内端管理",
  description: "面向跨境电商卖家的 TikTok Shop 智能管理系统 - 国内端管理"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="h-screen overflow-hidden antialiased">
        <Providers>
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
        <Toaster
          position="top-center"
          toastOptions={{
            className: "backdrop-blur-md bg-slate-900/80 border border-cyan-500/20",
            style: {
              background: "rgba(15, 23, 42, 0.8)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(103, 232, 249, 0.2)",
              color: "#67e8f9",
            },
            classNames: {
              toast: "backdrop-blur-md bg-slate-900/80 border border-cyan-500/20 text-cyan-300",
              title: "text-cyan-300 font-medium",
              description: "text-cyan-200/80",
              success: "bg-emerald-900/20 border-emerald-500/30 text-emerald-300",
              error: "bg-rose-900/20 border-rose-500/30 text-rose-300",
              warning: "bg-amber-900/20 border-amber-500/30 text-amber-300",
              info: "bg-cyan-900/20 border-cyan-500/30 text-cyan-300",
            },
          }}
        />
      </body>
    </html>
  );
}
