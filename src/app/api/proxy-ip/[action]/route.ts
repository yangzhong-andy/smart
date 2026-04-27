import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError } from "@/lib/api-response";
import { wanziServerRequest } from "@/lib/wanzi-server";

export const dynamic = "force-dynamic";

type Params = { action: string };

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
    return serverError("代理IP接口请求失败", error, { includeDetailsInDev: true });
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
      const data = await wanziServerRequest("/OpenApiList", {
        proxies_type: body.proxies_type,
        ...(body.city_name ? { city_name: body.city_name } : {}),
        ...(body.expiring_days ? { expiring_days: Number(body.expiring_days) } : {}),
      });
      return NextResponse.json({ success: true, data });
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
    return serverError("代理IP接口请求失败", error, { includeDetailsInDev: true });
  }
}
