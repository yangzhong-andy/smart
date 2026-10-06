"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, GripVertical, KeyRound, LockKeyhole, Send, Settings2, X } from "lucide-react";

type Message = { role: "user" | "assistant"; text: string; meta?: string };
type Position = { right: number; bottom: number };

const QUICK_QUESTIONS = ["近15天三个平台订单量怎么样？", "现在钱包和系统余额哪里不一致？", "有哪些待关联提款和异常流水明细？", "当前哪些 SKU 库存偏低？"];
const PANEL_WIDTH = 390;
const PANEL_HEIGHT = 520;

function clampPosition(position: Position, width = 56, height = 56): Position {
  if (typeof window === "undefined") return position;
  return {
    right: Math.max(8, Math.min(position.right, Math.max(8, window.innerWidth - width - 8))),
    bottom: Math.max(8, Math.min(position.bottom, Math.max(8, window.innerHeight - height - 8))),
  };
}

async function readJsonResponse(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) throw new Error(`服务返回空内容（HTTP ${response.status}），请稍后重试`);
  try { return JSON.parse(raw); }
  catch { throw new Error(`服务响应格式异常（HTTP ${response.status}），请检查 API 地址或稍后重试`); }
}

export default function AiFloatingAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ right: 24, bottom: 24 });
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState(15);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [configSource, setConfigSource] = useState<"server" | "browser" | "environment" | "none">("none");
  const [canManage, setCanManage] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4.1-mini");
  const [configBusy, setConfigBusy] = useState(false);
  const [configError, setConfigError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "你好，我是 ERP 只读助手。可以查询财务、订单、库存和利润，不会修改系统数据。" },
  ]);
  const dragRef = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("smart-erp-ai-floating-position");
    if (!saved) return;
    try { setPosition(clampPosition(JSON.parse(saved))); } catch { /* ignore stale local position */ }
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const drag = dragRef.current;
      if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 5) movedRef.current = true;
      const next = clampPosition({ right: drag.right - (event.clientX - drag.x), bottom: drag.bottom - (event.clientY - drag.y) }, open ? PANEL_WIDTH : 56, open ? PANEL_HEIGHT + 12 : 56);
      setPosition(next);
    };
    const stop = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
      window.localStorage.setItem("smart-erp-ai-floating-position", JSON.stringify(position));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
  }, [position, open]);

  useEffect(() => {
    const resize = () => setPosition((current) => clampPosition(current, open ? PANEL_WIDTH : 56, open ? PANEL_HEIGHT + 12 : 56));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [open]);

  useEffect(() => {
    if (!open || configured !== null) return;
    void fetch("/api/ai/config").then(async (response) => {
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(body.error || "授权状态读取失败");
      setConfigured(Boolean(body.configured));
      setConfigSource(body.source || "none");
      setCanManage(Boolean(body.canManage));
      if (body.endpoint) setApiEndpoint(body.endpoint);
      if (body.model) setModel(body.model);
      if (!body.configured && body.canManage) setSettingsOpen(true);
    }).catch((error) => setConfigError(error instanceof Error ? error.message : "授权状态读取失败"));
  }, [open, configured]);

  if (pathname === "/login" || pathname === "/ai-assistant") return null;

  function startDrag(event: React.PointerEvent) {
    if (open && (event.target as HTMLElement).closest("button, input, select")) return;
    movedRef.current = false;
    dragRef.current = { x: event.clientX, y: event.clientY, right: position.right, bottom: position.bottom };
    setDragging(true);
  }

  async function ask(value = question) {
    const text = value.trim();
    if (!text || busy) return;
    setQuestion("");
    setMessages((items) => [...items, { role: "user", text }]);
    setBusy(true);
    try {
      const history = messages.slice(-6).map((item) => ({ role: item.role, content: item.text }));
      const request = () => fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, days, history }) });
      let response = await request();
      if (response.status === 502 || response.status === 503 || response.status === 504) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        response = await request();
      }
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(body.error || "查询失败");
      const providerStatus = body.providerError ? ` · AI 连接失败：${body.providerError}` : "";
      setMessages((items) => [...items, { role: "assistant", text: body.answer, meta: `${body.provider ? "AI 解释" : "规则兜底"} · 只读 · ${body.snapshot?.scope || ""}${providerStatus}` }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error instanceof Error ? error.message : "查询失败" }]);
    } finally { setBusy(false); }
  }

  async function saveProviderConfig(event: React.FormEvent) {
    event.preventDefault();
    setConfigBusy(true); setConfigError("");
    try {
      const response = await fetch("/api/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: apiEndpoint, apiKey, model }) });
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(body.error || "授权保存失败");
      setConfigured(true); setConfigSource("server"); setSettingsOpen(false); setApiKey("");
      setMessages((items) => [...items, { role: "assistant", text: "AI 连接测试通过，授权已保存在服务器。其他电脑登录后也可使用；密钥不会在页面显示。" }]);
    } catch (error) { setConfigError(error instanceof Error ? error.message : "授权保存失败"); }
    finally { setConfigBusy(false); }
  }

  async function migrateBrowserConfig() {
    setConfigBusy(true); setConfigError("");
    try {
      const response = await fetch("/api/ai/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ useBrowserConfig: true }) });
      const body = await readJsonResponse(response);
      if (!response.ok) throw new Error(body.error || "迁移失败");
      setConfigured(true); setConfigSource("server"); setSettingsOpen(false);
      setMessages((items) => [...items, { role: "assistant", text: "当前浏览器的 AI 授权已验证并迁移到服务器。其他电脑登录后可直接使用。" }]);
    } catch (error) { setConfigError(error instanceof Error ? error.message : "迁移失败"); }
    finally { setConfigBusy(false); }
  }

  const panelWidth = `min(${PANEL_WIDTH}px, calc(100vw - 16px))`;
  return (
    <div className="pointer-events-none fixed z-[120]" style={{ right: position.right, bottom: position.bottom }}>
      {open && <section className="pointer-events-auto mb-3 flex flex-col overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/95 shadow-2xl shadow-cyan-950/40 backdrop-blur" style={{ width: panelWidth, height: `min(${PANEL_HEIGHT}px, calc(100vh - 24px))` }} aria-label="AI 智能经营中枢">
        <header className={`flex cursor-move items-center justify-between border-b border-slate-800 bg-slate-900/95 px-3 py-2.5 ${dragging ? "cursor-grabbing" : ""}`} onPointerDown={startDrag}>
          <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /><span className="text-sm font-semibold">AI 智能经营中枢</span><span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">只读</span><GripVertical className="ml-1 h-4 w-4 text-slate-600" /></div>
          <div className="flex items-center gap-1">{canManage && <button type="button" onClick={() => setSettingsOpen(true)} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-cyan-200" aria-label="配置 AI 授权"><Settings2 className="h-4 w-4" /></button>}
          <button type="button" onClick={() => { setOpen(false); setPosition((current) => clampPosition(current)); }} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="关闭 AI 助手"><X className="h-4 w-4" /></button>
          </div>
        </header>
        {settingsOpen ? <form onSubmit={saveProviderConfig} className="flex-1 space-y-3 overflow-y-auto p-4 text-xs leading-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><KeyRound className="h-4 w-4" />配置 AI 授权</div>
          <p className="text-[11px] text-slate-400">管理员统一配置服务器授权，其他电脑登录后直接使用。密钥经连接测试后加密保存在服务器受限目录，不会回显。当前网页仍是 HTTP，输入新密钥前建议先配置 HTTPS。</p>
          {configSource === "browser" && <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-2.5 text-slate-300">当前浏览器已有可用授权，无需重新输入密钥。<button type="button" onClick={() => void migrateBrowserConfig()} disabled={configBusy} className="mt-2 block rounded-lg bg-cyan-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">{configBusy ? "测试并迁移中…" : "将当前授权迁移到服务器"}</button></div>}
          {configSource === "server" && <p className="text-emerald-300">服务器已配置；在这里填写新信息可随时更换。</p>}
          <label className="block text-slate-400">API 基础地址<input value={apiEndpoint} onChange={(event) => setApiEndpoint(event.target.value)} placeholder="https://your-gateway.example" className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-400" required /></label>
          <label className="block text-slate-400">模型名称<input value={model} onChange={(event) => setModel(event.target.value)} placeholder="gpt-4.1-mini" className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-400" required /></label>
          <label className="block text-slate-400">API 密钥<input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="填入新生成的密钥" className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-400" required /></label>
          {configError && <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-200">{configError}</div>}
          <div className="flex gap-2"><button type="submit" disabled={configBusy} className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{configBusy ? "测试连接并保存…" : "测试连接并保存"}</button><button type="button" onClick={() => { setSettingsOpen(false); setConfigError(""); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">暂不配置</button></div>
        </form> : <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs leading-5">
          {configured === false && !canManage && <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 text-amber-200">服务器尚未配置 AI 授权，请联系管理员。</div>}
          {messages.map((message, index) => <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[92%] rounded-xl px-3 py-2 ${message.role === "user" ? "bg-cyan-600 text-white" : "border border-slate-800 bg-slate-900 text-slate-200"}`}><div className="whitespace-pre-wrap">{message.text}</div>{message.meta && <div className="mt-1 border-t border-slate-700 pt-1 text-[10px] text-slate-500">{message.meta}</div>}</div></div>)}
          {busy && <div className="text-slate-500">正在读取系统数据…</div>}
        </div>}
        <div className="border-t border-slate-800 p-2.5">
          <div className="mb-2 flex items-center justify-between text-[10px] text-slate-500"><span className="flex items-center gap-1"><LockKeyhole className="h-3 w-3" />不会改账或执行操作</span><label>最近 <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded border border-slate-700 bg-slate-900 px-1 text-slate-300"><option value={7}>7</option><option value={15}>15</option><option value={30}>30</option><option value={90}>90</option></select> 天</label></div>
          {!settingsOpen && <><div className="mb-2 flex gap-1 overflow-x-auto pb-1">{QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => void ask(item)} disabled={busy} className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400 hover:border-cyan-400/50 hover:text-cyan-200 disabled:opacity-50">{item}</button>)}</div>
          <form className="flex gap-1.5" onSubmit={(event) => { event.preventDefault(); void ask(); }}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="问一下财务、订单或库存…" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 outline-none focus:border-cyan-400" /><button type="submit" disabled={busy || !question.trim()} className="flex h-9 items-center gap-1 rounded-lg bg-cyan-500 px-2.5 text-xs font-semibold text-slate-950 disabled:opacity-40"><Send className="h-3.5 w-3.5" />查询</button></form></>}
        </div>
      </section>}
      {!open && <button type="button" onClick={() => { if (!movedRef.current) { setPosition((current) => clampPosition(current, PANEL_WIDTH, PANEL_HEIGHT + 12)); setOpen(true); } }} onPointerDown={startDrag} className="pointer-events-auto flex h-14 w-14 touch-none cursor-move items-center justify-center rounded-full border border-cyan-300/50 bg-cyan-500 text-slate-950 shadow-xl shadow-cyan-950/50 transition hover:scale-105" aria-label="打开 AI 智能经营中枢" title="拖动或点击打开 AI 智能经营中枢"><Bot className="h-7 w-7" /></button>}
    </div>
  );
}
