"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProductsRedirect() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/product-center/products");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-slate-400">正在跳转到产品档案页面...</div>
    </div>
  );
}
