"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function DebugPage() {
  const { data: session, status } = useSession();
  const [sessionData, setSessionData] = useState<any>(null);

  useEffect(() => {
    fetch('/api/debug-session')
      .then(res => res.json())
      .then(data => setSessionData(data))
      .catch(err => setSessionData({ error: err.message }));
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white">
      <h1 className="text-2xl font-bold mb-6">NextAuth 调试信息</h1>
      
      <div className="space-y-4">
        <div className="bg-slate-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">客户端 Session 状态</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify({ status, session }, null, 2)}
          </pre>
        </div>

        <div className="bg-slate-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">服务端 Session 状态</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(sessionData, null, 2)}
          </pre>
        </div>

        <div className="bg-slate-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">环境变量</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify({
              NEXTAUTH_URL: process.env.NEXT_PUBLIC_NEXTAUTH_URL || '未设置',
              NODE_ENV: process.env.NODE_ENV
            }, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
