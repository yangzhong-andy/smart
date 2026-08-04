"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Send, MessageSquare, RefreshCw } from "lucide-react";

export default function TikTokAffiliatePage() {
  const [shops, setShops] = useState<{shopId:string;shopName:string}[]>([]);
  const [shopId, setShopId] = useState("");
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/tiktok/data?type=shops").then(r => r.json()).then(d => {
      const list = d.shops || [];
      setShops(list);
      if (list.length > 0) setShopId(list[0].shopId);
    }).catch(() => {});
  }, []);

  // 获取对话列表
  const fetchConversations = useCallback(async () => {
    if (!shopId) return;
    setLoadingList(true);
    try {
      const res = await fetch(`/api/tiktok/affiliate?shopId=${shopId}&action=list`);
      const d = await res.json();
      setConversations(d.conversations || []);
      if (d.conversations?.length > 0 && !selectedConv) {
        setSelectedConv(d.conversations[0].id);
      }
    } catch { toast.error("加载对话失败"); }
    setLoadingList(false);
  }, [shopId]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // 获取消息
  const fetchMessages = useCallback(async () => {
    if (!shopId || !selectedConv) return;
    setLoadingMsgs(true);
    try {
      const res = await fetch(`/api/tiktok/affiliate?shopId=${shopId}&action=messages&conversationId=${selectedConv}`);
      const d = await res.json();
      setMessages(d.messages || []);
    } catch { toast.error("加载消息失败"); }
    setLoadingMsgs(false);
  }, [shopId, selectedConv]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // 发送消息
  const handleSend = async () => {
    if (!sendText.trim() || !shopId || !selectedConv) return;
    setSending(true);
    try {
      const res = await fetch("/api/tiktok/affiliate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, conversationId: selectedConv, content: sendText.trim() }),
      });
      const d = await res.json();
      if (d.success) {
        toast.success("发送成功");
        setSendText("");
        fetchMessages();
      } else {
        toast.error(d.error || "发送失败");
      }
    } catch { toast.error("发送失败"); }
    setSending(false);
  };

  const fmtTime = (d: string | null) => {
    if (!d) return "";
    return new Date(d).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary-400" />
            联盟营销消息
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {shops.length > 1 && (
            <select value={shopId} onChange={(e) => { setShopId(e.target.value); setSelectedConv(null); }}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200">
              {shops.map(s => <option key={s.shopId} value={s.shopId}>{s.shopName}</option>)}
            </select>
          )}
          <button onClick={fetchConversations} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm text-slate-200">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 主体：左侧对话列表 + 右侧消息 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：对话列表 */}
        <div className="w-64 border-r border-slate-800 overflow-y-auto">
          {loadingList ? (
            <div className="text-center py-8 text-slate-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">暂无对话</div>
          ) : (
            conversations.map((c) => (
              <button key={c.id} onClick={() => setSelectedConv(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                  selectedConv === c.id ? "bg-primary-900/20 border-l-2 border-l-primary-500" : ""
                }`}>
                <div className="text-xs text-slate-400 font-mono truncate">{c.id}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {c.unread_count > 0 && <span className="text-rose-400">{c.unread_count}条未读</span>}
                </div>
              </button>
            ))
          )}
        </div>

        {/* 右侧：消息区域 */}
        <div className="flex-1 flex flex-col">
          {loadingMsgs ? (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">暂无消息</div>
          ) : (
            <>
              {/* 消息列表 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.isFromSeller ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] rounded-xl px-4 py-2 ${
                      m.isFromSeller
                        ? "bg-primary-600 text-white"
                        : "bg-slate-800 text-slate-200"
                    }`}>
                      {!m.isFromSeller && (
                        <div className="text-xs text-slate-400 mb-1">达人</div>
                      )}
                      <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={`text-xs mt-1 ${m.isFromSeller ? "text-primary-200" : "text-slate-500"}`}>
                        {fmtTime(m.createTime)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 输入框 */}
              <div className="border-t border-slate-800 p-4">
                <div className="flex items-end gap-2">
                  <textarea
                    value={sendText}
                    onChange={(e) => setSendText(e.target.value)}
                    placeholder="输入消息..."
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-primary-500"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!sendText.trim() || sending}
                    className="rounded-lg bg-primary-500 hover:bg-primary-600 px-4 py-2 text-white disabled:opacity-50 flex items-center gap-1"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    发送
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
