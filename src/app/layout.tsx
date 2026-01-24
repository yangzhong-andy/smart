import type { Metadata } from "next";
import "./globals.css";
import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import LayoutWrapper from "./layout-wrapper";

export const metadata: Metadata = {
  title: "TK Smart ERP - 国内端管理",
  description: "面向跨境电商卖家的 TikTok Shop 智能管理系统 - 国内端管理"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="h-screen overflow-hidden antialiased">
        <Providers>
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
