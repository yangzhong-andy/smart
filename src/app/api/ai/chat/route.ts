import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { chooseAiTool, runReadOnlyAiTool } from "@/lib/ai/read-only-tools";
import { configFromRequest, resolveAiProviderUrl, type AiProviderConfig } from "@/lib/ai/provider-config";

export const dynamic = "force-dynamic";
function textFromResponse(body: any): string | null {
  if (typeof body?.output_text === "string" && body.output_text.trim()) return body.output_text.trim();
  const chatText = body?.choices?.[0]?.message?.content;
  if (typeof chatText === "string" && chatText.trim()) return chatText.trim();
  const chunks = Array.isArray(body?.output) ? body.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []) : [];
  const text = chunks.filter((item: any) => typeof item?.text === "string").map((item: any) => item.text).join("\n").trim();
  return text || null;
}
function fallbackAnswer(snapshot: any) {
  const summary = snapshot.summary || {};
  if (snapshot.tool === "wallet_reconciliation") {
    const details = snapshot.detail?.exceptionDetails;
    const pagoRows = Array.isArray(details?.mercadoPago) ? details.mercadoPago.slice(0, 10) : [];
    const shopeeRows = Array.isArray(details?.shopee) ? details.shopee.slice(0, 10) : [];
    const lines = [
      `当前钱包对账：Shopee 共 ${summary.shopeeWalletCount} 个店铺钱包，余额不一致 ${summary.shopeeMismatchCount} 个、待复核官方流水 ${summary.shopeeReviewTransactionCount} 条；PAGO 按已绑定账号及父级账户分组统计，官方余额 ${summary.mercadoPagoOfficialBalance.toFixed(2)} BRL、系统余额 ${summary.mercadoPagoSystemBalance.toFixed(2)} BRL、差额 ${summary.mercadoPagoDifference.toFixed(2)} BRL，余额不一致 ${summary.mercadoPagoMismatchCount} 组。另有待关联提款 ${summary.mercadoPagoPendingPayoutCount} 条、待复核费用 ${summary.mercadoPagoReviewTransactionCount} 条。已排除 ${summary.excludedSystemPagoAccountCount} 个不属于当前授权账号分组的 PAGO 账户。`,
    ];
    if (pagoRows.length) {
      lines.push("PAGO 最近待处理明细：");
      for (const row of pagoRows) lines.push(`- ${new Date(row.occurredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}｜${row.amount.toFixed(2)} BRL｜${row.businessType}｜${row.matchStatus}｜${row.sourceId || row.transactionKey}`);
      if (details.mercadoPagoTruncated) lines.push(`- 仅展示最近 ${pagoRows.length} 条，完整结果仍保留在系统快照中。`);
    }
    if (shopeeRows.length) {
      lines.push("Shopee 最近待复核明细：");
      for (const row of shopeeRows) lines.push(`- ${new Date(row.occurredAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}｜${row.amount.toFixed(2)} BRL｜${row.shopName}｜${row.matchStatus}｜${row.orderSn || row.transactionId}`);
      if (details.shopeeTruncated) lines.push(`- 仅展示最近 ${shopeeRows.length} 条，完整结果仍保留在系统快照中。`);
    }
    return lines.join("\n");
  }
  if (snapshot.tool === "sync_diagnostics") return `当前接入 ${summary.shopCount} 个平台店铺/账号，其中正常 ${summary.activeCount} 个、断开 ${summary.disconnectedCount} 个、令牌或同步错误 ${summary.errorCount} 个。这里只检查状态，不会自动补同步。`;
  if (snapshot.tool === "finance_overview") return `这是只读财务快照（${snapshot.scope}）：Mercado Livre 流入 ${summary.mercadoIn.toFixed(2)} BRL、流出 ${summary.mercadoOut.toFixed(2)} BRL；Shopee 平台钱包净变动 ${summary.shopeeNet.toFixed(2)} BRL；TikTok 回款记录 ${summary.tiktokPaymentRows} 条。当前只展示平台流水概览，不做钱包余额对账，也不跨币种汇总。`;
  if (snapshot.tool === "sales_overview") return `${snapshot.scope}：利润口径有效销售订单 Shopee ${summary.shopeeOrders} 单、Mercado Livre ${summary.mercadoOrders} 单、TikTok ${summary.tiktokOrders} 单，合计 ${summary.totalOrders} 单。平台原始订单记录 ${summary.rawOrderRows} 单；取消 ${summary.cancelledOrders} 单、未支付/未完成 ${summary.unpaidOrders} 单、样品或其他非销售状态 ${summary.otherExcludedOrders} 单（其中 TikTok 样品单 ${summary.tiktokSampleOrders} 单），均未计入有效订单及 SKU 销量。`;
  if (snapshot.tool === "inventory_overview") return `本次读取了最多 100 个产品档案 SKU，档案库存小计 ${summary.stockQuantity} 件。不是所有仓库的实时库存，也尚未结合销量计算补货量。`;
  return `当前有 ${summary.rows} 条利润测算档案，平均测算利润约 ${summary.averageProfitCny.toFixed(2)} CNY，平均 ROI ${summary.averageRoi.toFixed(2)}。这是测算数据，不会修改利润规则。`;
}
type ConversationMessage = { role: "user" | "assistant"; content: string };
async function optionalProviderAnswer(question: string, history: ConversationMessage[], snapshot: any, config: AiProviderConfig | null) {
  if (!config) return null;
  const { apiKey, endpoint: base, model } = config;
  const url = resolveAiProviderUrl(base);
  const safeSnapshot = { tool: snapshot.tool, scope: snapshot.scope, source: snapshot.source, summary: snapshot.summary, detail: snapshot.detail, note: snapshot.note };
  const conversation = history.slice(-6).map((item) => `${item.role === "user" ? "用户" : "助手"}：${item.content}`).join("\n");
  const prompt = `你是 ERP 只读经营助手。只能根据下面的系统快照回答，不得补造数字。用户明确提出的时间范围已经由系统解析为 scope，必须严格按该范围回答。优先直接回答用户问题，再列出必要明细；说明数据范围、币种和限制。做钱包对账时，只能使用快照中已经绑定并归组的账户，绝不能把 excludedSystemPagoAccounts 中其他主体的账户加进 PAGO 对账。若快照不支持，明确说当前工具尚不支持。\n最近对话：\n${conversation || "无"}\n当前问题：${question}\n系统快照：${JSON.stringify(safeSnapshot)}`;
  const chatCompletions = /\/chat\/completions\/?$/.test(url.pathname);
  const payload = chatCompletions ? { model, messages: [{ role: "user", content: prompt }], max_tokens: 700 } : { model, input: prompt, max_output_tokens: 700 };
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`AI 服务返回 ${response.status}`);
  return textFromResponse(await response.json());
}
export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request, { roles: ["SUPER_ADMIN", "ADMIN", "MANAGER"] }); if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const question = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  const history: ConversationMessage[] = Array.isArray(body?.history) ? body.history
    .filter((item: any) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-6).map((item: any) => ({ role: item.role, content: item.content.trim().slice(0, 1000) }))
    : [];
  const days = Number.isFinite(Number(body?.days)) ? Math.min(90, Math.max(1, Number(body.days))) : 15;
  if (!question) return NextResponse.json({ error: "请输入问题" }, { status: 400 });
  try {
    const userContext = history.filter((item) => item.role === "user").map((item) => item.content);
    const routingQuestion = [...userContext, question].join(" ").trim();
    const hasExplicitTime = (value: string) => /今天|今日|昨天|昨日|前天|(?:最近|近|过去)\s*\d{1,3}\s*(?:天|日)/.test(value);
    const timeContext = hasExplicitTime(question) ? "" : [...userContext].reverse().find(hasExplicitTime) || "";
    const queryQuestion = `${timeContext} ${question}`.trim();
    const tool = chooseAiTool(routingQuestion);
    const snapshot = await runReadOnlyAiTool(tool, { question: queryQuestion, days });
    const config = await configFromRequest(request);
    let providerError: string | null = null;
    let answer = await optionalProviderAnswer(question, history, snapshot, config).catch((error) => { providerError = error instanceof Error ? error.message : "AI 服务调用失败"; return null; });
    const provider = Boolean(answer);
    if (!answer) answer = fallbackAnswer(snapshot);
    const exceptionDetails = snapshot.tool === "wallet_reconciliation" ? snapshot.detail?.exceptionDetails : null;
    const evidence = exceptionDetails ? {
      shopeeDetailRows: Array.isArray(exceptionDetails.shopee) ? exceptionDetails.shopee.length : 0,
      mercadoPagoDetailRows: Array.isArray(exceptionDetails.mercadoPago) ? exceptionDetails.mercadoPago.length : 0,
      shopeeTruncated: Boolean(exceptionDetails.shopeeTruncated),
      mercadoPagoTruncated: Boolean(exceptionDetails.mercadoPagoTruncated),
      detailLimit: exceptionDetails.limit,
    } : null;
    return NextResponse.json({ answer, tool, snapshot: { scope: snapshot.scope, source: snapshot.source, summary: snapshot.summary, note: snapshot.note, evidence }, provider, providerConfigured: Boolean(config), providerError, readOnly: true });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AI 查询失败" }, { status: 500 }); }
}
