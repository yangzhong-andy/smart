"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuppliersRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/procurement/suppliers");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-slate-400">正在跳转到供应商页面...</div>
    </div>
  );
}
