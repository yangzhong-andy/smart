import { NextRequest, NextResponse } from "next/server";
import { badRequest } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { wanziServerRequest } from "@/lib/wanzi-server";

export const dynamic = "force-dynamic";

type Params = { action: string };

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { action } = await params;
    if (action === "credit") {
      const data = await wanziServerRequest("/OpenApiCredit", {});
      return NextResponse.json({ success: true, data });
    }
    if (action === "business") {
      const data = await wanziServerRequest("/OpenApiBusiness", {});
      return NextResponse.json({ success: true, data });
    }
    return badRequest("不支持的操作");
  } catch (error) {
    const details = extractErrorMessage(error);
    return NextResponse.json(
      {
        error: "代理IP接口请求失败",
        details,
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { action } = await params;
    const body = await request.json().catch(() => ({}));

    if (action === "inventory") {
      if (!body?.proxies_type || !body?.purpose_web) return badRequest("缺少 proxies_type 或 purpose_web");
      const data = await wanziServerRequest("/OpenApiInventory", {
        proxies_type: body.proxies_type,
        purpose_web: body.purpose_web,
      });
      return NextResponse.json({ success: true, data });
    }
    if (action === "purchase") {
      if (!body?.proxies_type || !body?.purpose_web || !body?.city_name || !body?.count) {
        return badRequest("缺少购买参数");
      }
      const data = await wanziServerRequest("/OpenApiPurchase", {
        proxies_type: body.proxies_type,
        purpose_web: body.purpose_web,
        udp_status: true,
        city_name: body.city_name,
        count: Number(body.count),
      });
      return NextResponse.json({ success: true, data });
    }
    if (action === "list") {
      if (!body?.proxies_type) return badRequest("缺少 proxies_type");
      const data = (await wanziServerRequest("/OpenApiList", {
        proxies_type: body.proxies_type,
        ...(body.city_name ? { city_name: body.city_name } : {}),
        ...(body.expiring_days ? { expiring_days: Number(body.expiring_days) } : {}),
      })) as { results?: Array<{ proxy_address?: string; port?: number; proxy_id?: number | string }> } | null;
      const results = Array.isArray(data?.results) ? data!.results! : [];
      const lineKey = (host: unknown, port: unknown) => {
        const h = String(host ?? "").trim();
        const p = Math.trunc(Number(port));
        if (!h || !Number.isFinite(p) || p < 1 || p > 65535) return "";
        return `${h}:${p}`;
      };
      const seenKeys = new Set<string>();
      const orFilters: Array<{ proxyHost: string; proxyPort: number }> = [];
      for (const r of results) {
        const h = String(r.proxy_address ?? "").trim();
        const p = Math.trunc(Number(r.port));
        if (!h || !Number.isFinite(p) || p < 1 || p > 65535) continue;
        const k = `${h}:${p}`;
        if (seenKeys.has(k)) continue;
        seenKeys.add(k);
        orFilters.push({ proxyHost: h, proxyPort: p });
      }
      let mergedResults = results.map((r) => ({ ...r, dedicated_line_string: "" as string }));
      try {
        const lineRows =
          orFilters.length > 0
            ? await prisma.proxyIpDedicatedLine.findMany({
                where: { OR: orFilters },
              })
            : [];
        const byKey = new Map(
          lineRows.map((row) => [lineKey(row.proxyHost, row.proxyPort), row.dedicatedLineString])
        );
        mergedResults = results.map((r) => ({
          ...r,
          dedicated_line_string: byKey.get(lineKey(r.proxy_address, r.port)) ?? "",
        }));
      } catch (mergeErr) {
        console.error("[proxy-ip/list] merge ProxyIpDedicatedLine failed:", mergeErr);
        // 线上若未跑迁移或 DB 不可用，仍返回万子列表，避免整页「我的 IP」不可用
      }
      return NextResponse.json({
        success: true,
        data: { ...data, results: mergedResults },
      });
    }
    if (action === "dedicated-line") {
      const proxyHost = typeof body?.proxy_address === "string" ? body.proxy_address.trim() : "";
      const proxyPort = Math.trunc(Number(body?.port));
      if (!proxyHost || !Number.isFinite(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
        return badRequest("缺少或非法 proxy_address / port");
      }
      const dedicated_line_string =
        typeof body?.dedicated_line_string === "string" ? body.dedicated_line_string : "";
      try {
        if (dedicated_line_string === "") {
          await prisma.proxyIpDedicatedLine.deleteMany({
            where: { proxyHost, proxyPort },
          });
        } else {
          await prisma.proxyIpDedicatedLine.upsert({
            where: {
              proxyHost_proxyPort: { proxyHost, proxyPort },
            },
            create: { proxyHost, proxyPort, dedicatedLineString: dedicated_line_string },
            update: { dedicatedLineString: dedicated_line_string },
          });
        }
      } catch (dbErr) {
        const details = extractErrorMessage(dbErr);
        return NextResponse.json(
          { success: false, error: "专线代理串保存失败", details },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true });
    }
    if (action === "renew") {
      if (!Array.isArray(body?.proxy_ids) || body.proxy_ids.length === 0) return badRequest("缺少 proxy_ids");
      const data = await wanziServerRequest("/OpenApiRenew", {
        proxies_ids: body.proxy_ids,
      });
      return NextResponse.json({ success: true, data });
    }
    if (action === "userpass") {
      if (!Array.isArray(body?.proxy_ids) || !body?.username || !body?.password) {
        return badRequest("缺少 proxy_ids / username / password");
      }
      const data = await wanziServerRequest("/OpenApiUserPass", {
        proxy_ids: body.proxy_ids,
        username: body.username,
        password: body.password,
      });
      return NextResponse.json({ success: true, data });
    }
    return badRequest("不支持的操作");
  } catch (error) {
    const details = extractErrorMessage(error);
    return NextResponse.json(
      {
        error: "代理IP接口请求失败",
        details,
      },
      { status: 500 }
    );
  }
}
